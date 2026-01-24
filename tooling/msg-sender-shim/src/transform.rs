// SPDX-License-Identifier: Apache-2.0
//
// TVA Protocol - msg.sender Auto-Shimming Transformer
//
// This module implements Solidity source-to-source transformations that convert
// EVM msg.sender patterns into Soroban-compatible requireAuth() patterns.
//
// Transformation Rules:
// 1. Ownership checks: require(msg.sender == X) -> X.requireAuth()
// 2. Transfer patterns: msg.sender as "from" -> add explicit param + requireAuth()
// 3. Mapping access: balances[msg.sender] -> balances[_caller] + requireAuth()
// 4. Simple reads: msg.sender reference -> _caller parameter + requireAuth()
// 5. Modifier patterns: onlyOwner with msg.sender -> owner.requireAuth()

use regex::Regex;
use std::collections::HashSet;

/// Represents a detected msg.sender usage pattern within a function.
#[derive(Debug, Clone, PartialEq)]
pub enum MsgSenderPattern {
    /// require(msg.sender == <expr>) or require(<expr> == msg.sender)
    OwnershipCheck { comparand: String },
    /// Mapping access like balances[msg.sender]
    MappingAccess { mapping_name: String },
    /// Assignment or general usage
    GeneralUsage,
}

/// Result of transforming a single Solidity source file.
#[derive(Debug, Clone)]
pub struct TransformResult {
    pub output: String,
    pub functions_transformed: usize,
    pub modifiers_transformed: usize,
    pub patterns_detected: Vec<(String, Vec<MsgSenderPattern>)>,
    pub warnings: Vec<String>,
}

/// Configuration for the transformer.
#[derive(Debug, Clone)]
pub struct TransformConfig {
    /// Name for the injected caller parameter
    pub caller_param_name: String,
    /// Whether to remove require statements that become redundant after auth insertion
    pub remove_redundant_requires: bool,
    /// Whether to handle modifier patterns
    pub transform_modifiers: bool,
}

impl Default for TransformConfig {
    fn default() -> Self {
        TransformConfig {
            caller_param_name: "_caller".to_string(),
            remove_redundant_requires: true,
            transform_modifiers: true,
        }
    }
}

/// Main transformer struct that processes Solidity source code.
pub struct MsgSenderTransformer {
    config: TransformConfig,
}

impl MsgSenderTransformer {
    pub fn new(config: TransformConfig) -> Self {
        MsgSenderTransformer { config }
    }

    /// Transform the entire source file content.
    pub fn transform(&self, source: &str) -> TransformResult {
        let mut result = TransformResult {
            output: String::new(),
            functions_transformed: 0,
            modifiers_transformed: 0,
            patterns_detected: Vec::new(),
            warnings: Vec::new(),
        };

        // If no msg.sender usage at all, return as-is
        if !source.contains("msg.sender") {
            result.output = source.to_string();
            return result;
        }

        let mut output = source.to_string();

        // Step 1: Collect modifier info and transform modifier definitions
        let mut modifier_auth_map: Vec<(String, String)> = Vec::new(); // (modifier_name, comparand)
        if self.config.transform_modifiers {
            let (new_output, mod_count, auth_map) = self.transform_modifiers(&output);
            output = new_output;
            result.modifiers_transformed = mod_count;
            modifier_auth_map = auth_map;
        }

        // Step 2: Transform functions that use msg.sender
        let (new_output, func_count, patterns) = self.transform_functions(&output);
        output = new_output;
        result.functions_transformed = func_count;
        result.patterns_detected = patterns;

        // Step 3: For functions using transformed modifiers, inject auth and remove modifier
        output = self.apply_modifier_auth(&output, &modifier_auth_map);

        result.output = output;
        result
    }

    /// Transform modifier definitions that use msg.sender.
    /// Example:
    ///   modifier onlyOwner() { require(msg.sender == owner); _; }
    /// Becomes:
    ///   (removed, and functions using it get owner.requireAuth() injected)
    /// Returns: (transformed_source, count, Vec<(modifier_name, comparand)>)
    fn transform_modifiers(&self, source: &str) -> (String, usize, Vec<(String, String)>) {
        let modifier_re = Regex::new(
            r"(?s)modifier\s+(\w+)\s*\(\s*\)\s*\{([^}]*)\}"
        ).unwrap();

        let mut output = source.to_string();
        let mut count = 0;
        let mut auth_map: Vec<(String, String)> = Vec::new();

        // Collect all modifiers that use msg.sender
        let captures: Vec<_> = modifier_re.captures_iter(source).collect();
        for cap in captures.iter().rev() {
            let modifier_name = cap.get(1).unwrap().as_str();
            let modifier_body = cap.get(2).unwrap().as_str();

            if modifier_body.contains("msg.sender") {
                // Extract what msg.sender is compared against
                let comparand = self.extract_comparand_from_require(modifier_body)
                    .unwrap_or_else(|| self.config.caller_param_name.clone());

                auth_map.push((modifier_name.to_string(), comparand.clone()));

                // Generate a comment showing the transformation
                let replacement = format!(
                    "// [TVA shim] Modifier '{}' transformed:\n\
                     // Original caller check replaced with {}.requireAuth() in function bodies\n",
                    modifier_name,
                    comparand
                );

                let full_match = cap.get(0).unwrap();
                output = format!(
                    "{}{}{}",
                    &output[..full_match.start()],
                    replacement,
                    &output[full_match.end()..]
                );
                count += 1;
            }
        }

        (output, count, auth_map)
    }

    /// Transform function definitions that use msg.sender.
    fn transform_functions(&self, source: &str) -> (String, usize, Vec<(String, Vec<MsgSenderPattern>)>) {
        let mut output = String::new();
        let mut func_count = 0;
        let mut all_patterns: Vec<(String, Vec<MsgSenderPattern>)> = Vec::new();

        // Process the source line by line, but track function boundaries
        let functions = self.extract_functions(source);

        if functions.is_empty() {
            // No functions found, but there might be msg.sender in top-level code
            output = source.to_string();
            return (output, func_count, all_patterns);
        }

        let mut last_end = 0;
        for func_info in &functions {
            // Append text before this function
            output.push_str(&source[last_end..func_info.start]);

            if func_info.body.contains("msg.sender") {
                let patterns = self.detect_patterns(&func_info.body);
                let transformed = self.transform_single_function(func_info, &patterns);
                output.push_str(&transformed);
                all_patterns.push((func_info.name.clone(), patterns));
                func_count += 1;
            } else {
                output.push_str(&source[func_info.start..func_info.end]);
            }

            last_end = func_info.end;
        }

        // Append remaining text after last function
        output.push_str(&source[last_end..]);

        (output, func_count, all_patterns)
    }

    /// Detect which msg.sender patterns are used in a function body.
    fn detect_patterns(&self, body: &str) -> Vec<MsgSenderPattern> {
        let mut patterns = Vec::new();
        let mut seen = HashSet::new();

        // Pattern 1: require(msg.sender == X) or require(X == msg.sender)
        let require_eq_re = Regex::new(
            r"require\s*\(\s*msg\.sender\s*==\s*([^,\)]+)\s*[,\)]"
        ).unwrap();
        let require_eq_rev_re = Regex::new(
            r"require\s*\(\s*([^,\(]+?)\s*==\s*msg\.sender\s*[,\)]"
        ).unwrap();

        for cap in require_eq_re.captures_iter(body) {
            let comparand = cap.get(1).unwrap().as_str().trim().to_string();
            let key = format!("ownership:{}", comparand);
            if !seen.contains(&key) {
                seen.insert(key);
                patterns.push(MsgSenderPattern::OwnershipCheck { comparand });
            }
        }
        for cap in require_eq_rev_re.captures_iter(body) {
            let comparand = cap.get(1).unwrap().as_str().trim().to_string();
            let key = format!("ownership:{}", comparand);
            if !seen.contains(&key) {
                seen.insert(key);
                patterns.push(MsgSenderPattern::OwnershipCheck { comparand });
            }
        }

        // Pattern 2: mapping[msg.sender]
        let mapping_re = Regex::new(
            r"(\w+)\s*\[\s*msg\.sender\s*\]"
        ).unwrap();
        for cap in mapping_re.captures_iter(body) {
            let mapping_name = cap.get(1).unwrap().as_str().to_string();
            let key = format!("mapping:{}", mapping_name);
            if !seen.contains(&key) {
                seen.insert(key);
                patterns.push(MsgSenderPattern::MappingAccess { mapping_name });
            }
        }

        // Pattern 3: General usage (any remaining msg.sender)
        // Check if there are msg.sender usages not covered by the above patterns
        let general_re = Regex::new(r"msg\.sender").unwrap();
        let ownership_re = Regex::new(
            r"require\s*\([^)]*msg\.sender[^)]*\)"
        ).unwrap();
        let mapping_usage_re = Regex::new(
            r"\w+\s*\[\s*msg\.sender\s*\]"
        ).unwrap();

        let body_no_ownership = ownership_re.replace_all(body, "").to_string();
        let body_no_mapping = mapping_usage_re.replace_all(&body_no_ownership, "").to_string();

        if general_re.is_match(&body_no_mapping) && !seen.contains("general") {
            seen.insert("general".to_string());
            patterns.push(MsgSenderPattern::GeneralUsage);
        }

        patterns
    }

    /// Transform a single function that uses msg.sender.
    fn transform_single_function(
        &self,
        func: &FunctionInfo,
        patterns: &[MsgSenderPattern],
    ) -> String {
        let caller_name = &self.config.caller_param_name;

        // Determine what auth calls to inject
        let mut auth_calls: Vec<String> = Vec::new();
        let mut has_ownership_auth = false;

        for pattern in patterns {
            match pattern {
                MsgSenderPattern::OwnershipCheck { comparand } => {
                    auth_calls.push(format!("        {}.requireAuth();", comparand));
                    has_ownership_auth = true;
                }
                MsgSenderPattern::MappingAccess { .. } | MsgSenderPattern::GeneralUsage => {
                    if !has_ownership_auth {
                        // Only add caller auth if there is no ownership check
                        // (ownership check already implies auth on that address)
                        let caller_auth = format!("        {}.requireAuth();", caller_name);
                        if !auth_calls.contains(&caller_auth) {
                            auth_calls.push(caller_auth);
                        }
                    }
                }
            }
        }

        // Determine if we need to add _caller parameter
        let needs_caller_param = patterns.iter().any(|p| matches!(
            p,
            MsgSenderPattern::MappingAccess { .. } | MsgSenderPattern::GeneralUsage
        ));

        // Build the new function signature
        let mut new_sig = func.signature.clone();
        if needs_caller_param {
            new_sig = self.add_caller_parameter(&new_sig, caller_name);
        }

        // Build the new function body
        let mut new_body = func.body.clone();

        // Replace require(msg.sender == X) with nothing (auth replaces it)
        if self.config.remove_redundant_requires {
            new_body = self.remove_msg_sender_requires(&new_body);
        }

        // Replace all remaining msg.sender references with _caller
        let msg_sender_re = Regex::new(r"msg\.sender").unwrap();
        new_body = msg_sender_re.replace_all(&new_body, caller_name.as_str()).to_string();

        // Inject requireAuth calls at the beginning of the function body
        let auth_block = if auth_calls.is_empty() {
            String::new()
        } else {
            format!("\n{}\n", auth_calls.join("\n"))
        };

        // Reconstruct the function
        let indent = self.detect_indent(&func.raw);
        format!(
            "{}// [TVA shim] caller pattern -> explicit requireAuth\n\
             {}{} {{{}{}\n{}}}",
            indent,
            indent, new_sig.trim(),
            auth_block,
            self.indent_body(&new_body, &indent),
            indent
        )
    }

    /// Add a _caller parameter to a function signature.
    fn add_caller_parameter(&self, signature: &str, caller_name: &str) -> String {
        let param_re = Regex::new(r"\(([^)]*)\)").unwrap();
        if let Some(cap) = param_re.captures(signature) {
            let existing_params = cap.get(1).unwrap().as_str().trim();
            let new_param = format!("address {}", caller_name);
            let new_params = if existing_params.is_empty() {
                new_param
            } else {
                format!("{}, {}", new_param, existing_params)
            };
            let full_match = cap.get(0).unwrap();
            format!(
                "{}({}){}",
                &signature[..full_match.start()],
                new_params,
                &signature[full_match.end()..]
            )
        } else {
            signature.to_string()
        }
    }

    /// Remove require statements that check msg.sender equality.
    fn remove_msg_sender_requires(&self, body: &str) -> String {
        // Match require(msg.sender == X, "...") or require(X == msg.sender, "...")
        // Also match without the error message
        let patterns = [
            // require(msg.sender == X, "...")
            r#"require\s*\(\s*msg\.sender\s*==\s*[^,\)]+\s*,\s*"[^"]*"\s*\)\s*;"#,
            // require(X == msg.sender, "...")
            r#"require\s*\(\s*[^,\(]+?\s*==\s*msg\.sender\s*,\s*"[^"]*"\s*\)\s*;"#,
            // require(msg.sender == X)
            r"require\s*\(\s*msg\.sender\s*==\s*[^,\)]+\s*\)\s*;",
            // require(X == msg.sender)
            r"require\s*\(\s*[^,\(]+?\s*==\s*msg\.sender\s*\)\s*;",
        ];

        let mut result = body.to_string();
        for pattern in &patterns {
            let re = Regex::new(pattern).unwrap();
            result = re.replace_all(&result, "").to_string();
        }

        // Clean up any resulting empty lines (more than 2 consecutive newlines -> 2)
        let empty_lines_re = Regex::new(r"\n{3,}").unwrap();
        result = empty_lines_re.replace_all(&result, "\n\n").to_string();

        result
    }

    /// Apply modifier auth: remove modifier from function signatures and inject auth calls.
    fn apply_modifier_auth(&self, source: &str, modifier_auth_map: &[(String, String)]) -> String {
        if modifier_auth_map.is_empty() {
            return source.to_string();
        }

        let mut result = source.to_string();

        for (modifier_name, comparand) in modifier_auth_map {
            // Find functions that use this modifier and inject auth + remove modifier
            // We need to find patterns like:
            //   function foo(...) public onlyOwner {
            // and transform to:
            //   function foo(...) public {
            //       owner.requireAuth();

            let func_with_modifier_re = Regex::new(
                &format!(
                    r"(?s)((?:function\s+\w+\s*\([^)]*\)\s*(?:public|private|internal|external|view|pure|payable|\s)*))\b{}\b(\s*(?:(?:public|private|internal|external|view|pure|payable|returns\s*\([^)]*\)|\s)*)\s*\{{)",
                    regex::escape(modifier_name)
                )
            ).unwrap();

            // Replace each match: remove modifier name, inject auth after opening brace
            let auth_line = format!("\n        {}.requireAuth();", comparand);

            // Use a simpler approach: first remove the modifier, then inject auth after {
            // Step A: Remove modifier from signature
            let sig_re = Regex::new(
                &format!(r"(\)\s*(?:public|private|internal|external|view|pure|payable|\s)*)\b{}\b", regex::escape(modifier_name))
            ).unwrap();
            result = sig_re.replace_all(&result, "$1").to_string();

            // Step B: Now find functions that originally had this modifier
            // We need a different approach: track which functions had the modifier
            // Let's do it differently - we already removed it, now we need to find those functions
            // that were affected and inject auth.

            // Actually, let's do it in one pass by finding function bodies that DON'T already
            // have the auth call for this comparand
            // The functions that were modified will be those that now have the modifier removed.
            // Since we can't easily track which ones had it, let's do the replacement differently.

            // Reset and redo: find each function with modifier, capture its body start, inject auth
            let _ = func_with_modifier_re; // suppress unused
            let _ = auth_line; // suppress unused
        }

        // Better approach: do it all in one pass per modifier
        result = source.to_string();
        for (modifier_name, comparand) in modifier_auth_map {
            let mut new_result = String::new();
            let mut remaining = result.as_str();

            // Find function signatures that contain this modifier
            loop {
                // Look for the pattern: ) ... modifierName ... {
                // We need to find "function" first, then check if it has the modifier
                if let Some(func_pos) = remaining.find("function ") {
                    new_result.push_str(&remaining[..func_pos]);
                    remaining = &remaining[func_pos..];

                    // Find the opening brace of this function
                    if let Some(brace_pos) = self.find_function_open_brace(remaining) {
                        let sig_portion = &remaining[..brace_pos];

                        // Check if this signature contains our modifier
                        let mod_re = Regex::new(
                            &format!(r"\b{}\b", regex::escape(modifier_name))
                        ).unwrap();

                        if mod_re.is_match(sig_portion) {
                            // Remove the modifier from signature
                            let cleaned_sig = mod_re.replace_all(sig_portion, "").to_string();
                            // Clean up double spaces
                            let cleaned_sig = Regex::new(r"  +").unwrap()
                                .replace_all(&cleaned_sig, " ").to_string();

                            new_result.push_str(&cleaned_sig);
                            // Add the opening brace and inject auth
                            new_result.push_str("{\n");
                            new_result.push_str(&format!("        {}.requireAuth();\n", comparand));
                            remaining = &remaining[brace_pos + 1..];
                        } else {
                            // No modifier in this function, copy as-is up to and including brace
                            new_result.push_str(&remaining[..brace_pos + 1]);
                            remaining = &remaining[brace_pos + 1..];
                        }
                    } else {
                        // No brace found, copy the "function" keyword and move on
                        new_result.push_str(&remaining[..9.min(remaining.len())]);
                        remaining = &remaining[9.min(remaining.len())..];
                    }
                } else {
                    // No more functions
                    new_result.push_str(remaining);
                    break;
                }
            }

            result = new_result;
        }

        result
    }

    /// Find the opening brace of a function definition (skipping parentheses).
    fn find_function_open_brace(&self, source: &str) -> Option<usize> {
        let mut paren_depth = 0;
        let chars: Vec<char> = source.chars().collect();
        let mut i = 0;
        let mut in_string = false;
        let mut string_char = '"';
        let mut found_parens = false;

        while i < chars.len() {
            let ch = chars[i];

            if in_string {
                if ch == string_char && (i == 0 || chars[i - 1] != '\\') {
                    in_string = false;
                }
                i += 1;
                continue;
            }

            if ch == '"' || ch == '\'' {
                in_string = true;
                string_char = ch;
                i += 1;
                continue;
            }

            if ch == '(' {
                paren_depth += 1;
                found_parens = true;
            } else if ch == ')' {
                paren_depth -= 1;
            } else if ch == '{' && paren_depth == 0 && found_parens {
                return Some(i);
            } else if ch == ';' && paren_depth == 0 && found_parens {
                // Abstract/interface function
                return None;
            }

            i += 1;
        }

        None
    }

    /// Extract the comparand from a require statement in a modifier body.
    fn extract_comparand_from_require(&self, body: &str) -> Option<String> {
        let re1 = Regex::new(r"require\s*\(\s*msg\.sender\s*==\s*([^,\)]+)").unwrap();
        let re2 = Regex::new(r"require\s*\(\s*([^,\(]+?)\s*==\s*msg\.sender").unwrap();

        if let Some(cap) = re1.captures(body) {
            return Some(cap.get(1).unwrap().as_str().trim().to_string());
        }
        if let Some(cap) = re2.captures(body) {
            return Some(cap.get(1).unwrap().as_str().trim().to_string());
        }
        None
    }

    /// Extract function information from source code.
    fn extract_functions(&self, source: &str) -> Vec<FunctionInfo> {
        let mut functions = Vec::new();
        let chars: Vec<char> = source.chars().collect();
        let len = chars.len();
        let mut i = 0;

        while i < len {
            // Look for "function" keyword
            if i + 8 <= len && &source[i..i + 8] == "function" {
                // Make sure it is not part of another word
                let prev_ok = i == 0 || !chars[i - 1].is_alphanumeric();
                let next_ok = i + 8 < len && (chars[i + 8].is_whitespace() || chars[i + 8] == '(');

                if prev_ok && next_ok {
                    if let Some(func_info) = self.parse_function_at(source, i) {
                        i = func_info.end;
                        functions.push(func_info);
                        continue;
                    }
                }
            }

            // Also look for "constructor" keyword
            if i + 11 <= len && &source[i..i + 11] == "constructor" {
                let prev_ok = i == 0 || !chars[i - 1].is_alphanumeric();
                let next_ok = i + 11 < len && (chars[i + 11].is_whitespace() || chars[i + 11] == '(');

                if prev_ok && next_ok {
                    if let Some(func_info) = self.parse_constructor_at(source, i) {
                        i = func_info.end;
                        functions.push(func_info);
                        continue;
                    }
                }
            }

            i += 1;
        }

        functions
    }

    /// Parse a function definition starting at the given offset.
    fn parse_function_at(&self, source: &str, start: usize) -> Option<FunctionInfo> {
        // Find function name
        let after_keyword = &source[start + 8..];
        let name_re = Regex::new(r"^\s*(\w+)\s*\(").unwrap();
        let name = name_re.captures(after_keyword)?.get(1)?.as_str().to_string();

        // Find the opening brace of the function body
        let mut brace_start = None;
        let mut paren_depth = 0;
        let chars: Vec<char> = source[start..].chars().collect();
        let mut j = 0;
        let mut in_string = false;
        let mut string_char = '"';

        while j < chars.len() {
            let ch = chars[j];

            if in_string {
                if ch == string_char && (j == 0 || chars[j - 1] != '\\') {
                    in_string = false;
                }
                j += 1;
                continue;
            }

            if ch == '"' || ch == '\'' {
                in_string = true;
                string_char = ch;
                j += 1;
                continue;
            }

            // Skip single-line comments
            if ch == '/' && j + 1 < chars.len() && chars[j + 1] == '/' {
                while j < chars.len() && chars[j] != '\n' {
                    j += 1;
                }
                continue;
            }

            // Skip multi-line comments
            if ch == '/' && j + 1 < chars.len() && chars[j + 1] == '*' {
                j += 2;
                while j + 1 < chars.len() && !(chars[j] == '*' && chars[j + 1] == '/') {
                    j += 1;
                }
                j += 2;
                continue;
            }

            if ch == '(' {
                paren_depth += 1;
            } else if ch == ')' {
                paren_depth -= 1;
            } else if ch == '{' && paren_depth == 0 {
                brace_start = Some(start + j);
                break;
            } else if ch == ';' && paren_depth == 0 {
                // This is an interface/abstract function without body
                return None;
            }

            j += 1;
        }

        let brace_start = brace_start?;

        // Find the matching closing brace
        let body_end = self.find_matching_brace(source, brace_start)?;

        // Extract signature (everything from function keyword to opening brace)
        let signature = source[start..brace_start].trim().to_string();

        // Extract body (between braces, exclusive)
        let body = source[brace_start + 1..body_end].to_string();

        Some(FunctionInfo {
            name,
            signature,
            body,
            raw: source[start..body_end + 1].to_string(),
            start,
            end: body_end + 1,
        })
    }

    /// Parse a constructor definition starting at the given offset.
    fn parse_constructor_at(&self, source: &str, start: usize) -> Option<FunctionInfo> {
        // Find the opening brace of the constructor body
        let mut brace_start = None;
        let mut paren_depth = 0;
        let chars: Vec<char> = source[start..].chars().collect();
        let mut j = 0;
        let mut in_string = false;
        let mut string_char = '"';

        while j < chars.len() {
            let ch = chars[j];

            if in_string {
                if ch == string_char && (j == 0 || chars[j - 1] != '\\') {
                    in_string = false;
                }
                j += 1;
                continue;
            }

            if ch == '"' || ch == '\'' {
                in_string = true;
                string_char = ch;
                j += 1;
                continue;
            }

            if ch == '(' {
                paren_depth += 1;
            } else if ch == ')' {
                paren_depth -= 1;
            } else if ch == '{' && paren_depth == 0 {
                brace_start = Some(start + j);
                break;
            }

            j += 1;
        }

        let brace_start = brace_start?;
        let body_end = self.find_matching_brace(source, brace_start)?;

        let signature = source[start..brace_start].trim().to_string();
        let body = source[brace_start + 1..body_end].to_string();

        Some(FunctionInfo {
            name: "constructor".to_string(),
            signature,
            body,
            raw: source[start..body_end + 1].to_string(),
            start,
            end: body_end + 1,
        })
    }

    /// Find the matching closing brace for an opening brace at the given position.
    fn find_matching_brace(&self, source: &str, open_pos: usize) -> Option<usize> {
        let chars: Vec<char> = source.chars().collect();
        let mut depth = 0;
        let mut i = open_pos;
        let mut in_string = false;
        let mut string_char = '"';

        while i < chars.len() {
            let ch = chars[i];

            if in_string {
                if ch == string_char && (i == 0 || chars[i - 1] != '\\') {
                    in_string = false;
                }
                i += 1;
                continue;
            }

            if ch == '"' || ch == '\'' {
                in_string = true;
                string_char = ch;
                i += 1;
                continue;
            }

            // Skip single-line comments
            if ch == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
                continue;
            }

            // Skip multi-line comments
            if ch == '/' && i + 1 < chars.len() && chars[i + 1] == '*' {
                i += 2;
                while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                    i += 1;
                }
                i += 2;
                continue;
            }

            if ch == '{' {
                depth += 1;
            } else if ch == '}' {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }

            i += 1;
        }

        None
    }

    /// Detect the indentation level of a block of code.
    fn detect_indent(&self, code: &str) -> String {
        for line in code.lines() {
            if !line.trim().is_empty() {
                let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
                return indent;
            }
        }
        "    ".to_string()
    }

    /// Indent a body block with the given base indent.
    fn indent_body(&self, body: &str, _base_indent: &str) -> String {
        // The body already has its original indentation; preserve it
        body.to_string()
    }
}

/// Information about a parsed function.
#[derive(Debug, Clone)]
pub struct FunctionInfo {
    pub name: String,
    pub signature: String,
    pub body: String,
    pub raw: String,
    pub start: usize,
    pub end: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_transformer() -> MsgSenderTransformer {
        MsgSenderTransformer::new(TransformConfig::default())
    }

    /// Check that no executable (non-comment) lines contain msg.sender
    fn has_msg_sender_in_code(output: &str) -> bool {
        output.lines().any(|line| {
            let trimmed = line.trim_start();
            !trimmed.starts_with("//") && trimmed.contains("msg.sender")
        })
    }

    #[test]
    fn test_no_msg_sender_unchanged() {
        let t = default_transformer();
        let src = r#"
pragma solidity ^0.8.0;
contract Foo {
    uint256 public value;
    function setValue(uint256 v) public {
        value = v;
    }
}
"#;
        let result = t.transform(src);
        assert_eq!(result.output, src);
        assert_eq!(result.functions_transformed, 0);
    }

    #[test]
    fn test_ownership_check_pattern() {
        let t = default_transformer();
        let src = r#"pragma solidity ^0.8.0;
contract Foo {
    address public owner;
    function restricted() public {
        require(msg.sender == owner, "not owner");
        doSomething();
    }
}
"#;
        let result = t.transform(src);
        assert!(result.output.contains("owner.requireAuth()"));
        assert!(!has_msg_sender_in_code(&result.output));
        assert_eq!(result.functions_transformed, 1);
    }

    #[test]
    fn test_ownership_check_reversed() {
        let t = default_transformer();
        let src = r#"pragma solidity ^0.8.0;
contract Foo {
    address public owner;
    function restricted() public {
        require(owner == msg.sender, "not owner");
        doSomething();
    }
}
"#;
        let result = t.transform(src);
        assert!(result.output.contains("owner.requireAuth()"));
        assert!(!has_msg_sender_in_code(&result.output));
    }

    #[test]
    fn test_mapping_access_pattern() {
        let t = default_transformer();
        let src = r#"pragma solidity ^0.8.0;
contract Token {
    mapping(address => uint256) public balances;
    function getBalance() public view returns (uint256) {
        return balances[msg.sender];
    }
}
"#;
        let result = t.transform(src);
        assert!(result.output.contains("_caller"));
        assert!(result.output.contains("requireAuth()"));
        assert!(result.output.contains("balances[_caller]"));
        assert!(!has_msg_sender_in_code(&result.output));
    }

    #[test]
    fn test_transfer_pattern() {
        let t = default_transformer();
        let src = r#"pragma solidity ^0.8.0;
contract Token {
    mapping(address => uint256) public balances;
    function transfer(address to, uint256 amount) public {
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
}
"#;
        let result = t.transform(src);
        assert!(result.output.contains("address _caller"));
        assert!(result.output.contains("_caller.requireAuth()"));
        assert!(result.output.contains("balances[_caller]"));
        assert!(!has_msg_sender_in_code(&result.output));
    }

    #[test]
    fn test_modifier_transform() {
        let t = default_transformer();
        let src = r#"pragma solidity ^0.8.0;
contract Foo {
    address public owner;
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }
    function restricted() public onlyOwner {
        doSomething();
    }
}
"#;
        let result = t.transform(src);
        assert!(result.output.contains("Modifier 'onlyOwner' transformed"));
        // The function body should not contain msg.sender
        // (comments may reference it in documentation but not in executable code)
        let non_comment_lines: String = result.output.lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!non_comment_lines.contains("msg.sender"),
            "Non-comment lines still contain msg.sender:\n{}", non_comment_lines);
        assert_eq!(result.modifiers_transformed, 1);
    }

    #[test]
    fn test_general_usage_pattern() {
        let t = default_transformer();
        let src = r#"pragma solidity ^0.8.0;
contract Foo {
    event Called(address caller);
    function emitCaller() public {
        emit Called(msg.sender);
    }
}
"#;
        let result = t.transform(src);
        assert!(result.output.contains("_caller"));
        assert!(result.output.contains("requireAuth()"));
        assert!(!has_msg_sender_in_code(&result.output));
    }

    #[test]
    fn test_detect_ownership_pattern() {
        let t = default_transformer();
        let body = r#"
        require(msg.sender == owner, "not owner");
        doSomething();
"#;
        let patterns = t.detect_patterns(body);
        assert_eq!(patterns.len(), 1);
        assert!(matches!(&patterns[0], MsgSenderPattern::OwnershipCheck { comparand } if comparand == "owner"));
    }

    #[test]
    fn test_detect_mapping_pattern() {
        let t = default_transformer();
        let body = r#"
        balances[msg.sender] -= amount;
"#;
        let patterns = t.detect_patterns(body);
        assert!(patterns.iter().any(|p| matches!(p, MsgSenderPattern::MappingAccess { mapping_name } if mapping_name == "balances")));
    }

    #[test]
    fn test_add_caller_parameter_empty() {
        let t = default_transformer();
        let sig = "function foo() public";
        let result = t.add_caller_parameter(sig, "_caller");
        assert_eq!(result, "function foo(address _caller) public");
    }

    #[test]
    fn test_add_caller_parameter_existing() {
        let t = default_transformer();
        let sig = "function transfer(address to, uint256 amount) public";
        let result = t.add_caller_parameter(sig, "_caller");
        assert_eq!(result, "function transfer(address _caller, address to, uint256 amount) public");
    }

    #[test]
    fn test_multiple_functions() {
        let t = default_transformer();
        let src = r#"pragma solidity ^0.8.0;
contract Token {
    mapping(address => uint256) public balances;
    address public owner;
    function transfer(address to, uint256 amount) public {
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
    function mint(uint256 amount) public {
        require(msg.sender == owner, "not owner");
        balances[msg.sender] += amount;
    }
    function getBalance() public view returns (uint256) {
        return balances[msg.sender];
    }
}
"#;
        let result = t.transform(src);
        assert_eq!(result.functions_transformed, 3);
        assert!(!has_msg_sender_in_code(&result.output));
    }

    #[test]
    fn test_constructor_with_msg_sender() {
        let t = default_transformer();
        let src = r#"pragma solidity ^0.8.0;
contract Foo {
    address public owner;
    constructor() {
        owner = msg.sender;
    }
}
"#;
        let result = t.transform(src);
        assert!(result.output.contains("_caller"));
        assert!(!has_msg_sender_in_code(&result.output));
    }

    #[test]
    fn test_custom_caller_name() {
        let config = TransformConfig {
            caller_param_name: "_invoker".to_string(),
            ..Default::default()
        };
        let t = MsgSenderTransformer::new(config);
        let src = r#"pragma solidity ^0.8.0;
contract Token {
    mapping(address => uint256) public balances;
    function getBalance() public view returns (uint256) {
        return balances[msg.sender];
    }
}
"#;
        let result = t.transform(src);
        assert!(result.output.contains("_invoker"));
        assert!(result.output.contains("address _invoker"));
    }
}
