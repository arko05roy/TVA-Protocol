// SPDX-License-Identifier: Apache-2.0
//
// TVA Protocol - msg.sender Auto-Shimming Preprocessor
//
// This tool transforms Solidity source files that use EVM msg.sender patterns
// into Soroban-compatible patterns using explicit address parameters and
// requireAuth() calls.
//
// Usage:
//   msg-sender-shim <input.sol> [-o output.sol]
//   msg-sender-shim --dir <contracts/> [--out-dir <contracts/.processed/>]
//
// The tool is designed to be used as a preprocessor step before compiling
// Solidity contracts with Solang for the Soroban target.
//
// Pipeline:
//   contracts/MyToken.sol (with msg.sender)
//       |
//       v
//   TVA Preprocessor (this tool)
//       |
//       v
//   contracts/.processed/MyToken.sol (explicit params + requireAuth)
//       |
//       v
//   Solang compiles to WASM

mod transform;

use clap::Parser;
use std::fs;
use std::path::{Path, PathBuf};
use transform::{MsgSenderTransformer, TransformConfig};

#[derive(Parser, Debug)]
#[command(
    name = "msg-sender-shim",
    about = "TVA Protocol: msg.sender auto-shimming preprocessor for Solang Soroban target",
    version
)]
struct Cli {
    /// Input Solidity file to transform
    #[arg(value_name = "INPUT")]
    input: Option<PathBuf>,

    /// Output file path (defaults to stdout if not specified)
    #[arg(short, long, value_name = "OUTPUT")]
    output: Option<PathBuf>,

    /// Process all .sol files in a directory
    #[arg(long, value_name = "DIR")]
    dir: Option<PathBuf>,

    /// Output directory for batch processing (defaults to <dir>/.processed/)
    #[arg(long, value_name = "OUT_DIR")]
    out_dir: Option<PathBuf>,

    /// Name for the injected caller parameter (default: _caller)
    #[arg(long, default_value = "_caller")]
    caller_name: String,

    /// Keep redundant require statements (don't remove msg.sender == X checks)
    #[arg(long)]
    keep_requires: bool,

    /// Skip modifier transformation
    #[arg(long)]
    skip_modifiers: bool,

    /// Verbose output showing transformation details
    #[arg(short, long)]
    verbose: bool,

    /// Dry run: show what would be changed without writing files
    #[arg(long)]
    dry_run: bool,
}

fn main() {
    let cli = Cli::parse();

    let config = TransformConfig {
        caller_param_name: cli.caller_name.clone(),
        remove_redundant_requires: !cli.keep_requires,
        transform_modifiers: !cli.skip_modifiers,
    };

    let transformer = MsgSenderTransformer::new(config);

    if let Some(dir) = &cli.dir {
        // Batch mode: process all .sol files in directory
        process_directory(&transformer, dir, &cli);
    } else if let Some(input) = &cli.input {
        // Single file mode
        process_single_file(&transformer, input, &cli);
    } else {
        eprintln!("Error: Either provide an input file or use --dir for batch processing.");
        eprintln!("Usage: msg-sender-shim <INPUT.sol> [-o OUTPUT.sol]");
        eprintln!("       msg-sender-shim --dir <contracts/> [--out-dir <output/>]");
        std::process::exit(1);
    }
}

fn process_single_file(transformer: &MsgSenderTransformer, input: &Path, cli: &Cli) {
    let source = match fs::read_to_string(input) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading {}: {}", input.display(), e);
            std::process::exit(1);
        }
    };

    let result = transformer.transform(&source);

    if cli.verbose {
        eprintln!("--- Transformation Report for {} ---", input.display());
        eprintln!("  Functions transformed: {}", result.functions_transformed);
        eprintln!("  Modifiers transformed: {}", result.modifiers_transformed);
        for (func_name, patterns) in &result.patterns_detected {
            eprintln!("  Function '{}': {:?}", func_name, patterns);
        }
        for warning in &result.warnings {
            eprintln!("  WARNING: {}", warning);
        }
        eprintln!("---");
    }

    if cli.dry_run {
        println!("{}", result.output);
        return;
    }

    if let Some(output_path) = &cli.output {
        if let Some(parent) = output_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).unwrap_or_else(|e| {
                    eprintln!("Error creating output directory: {}", e);
                    std::process::exit(1);
                });
            }
        }
        fs::write(output_path, &result.output).unwrap_or_else(|e| {
            eprintln!("Error writing to {}: {}", output_path.display(), e);
            std::process::exit(1);
        });
        if cli.verbose {
            eprintln!("Written to: {}", output_path.display());
        }
    } else {
        // Write to stdout
        print!("{}", result.output);
    }
}

fn process_directory(transformer: &MsgSenderTransformer, dir: &Path, cli: &Cli) {
    if !dir.exists() || !dir.is_dir() {
        eprintln!("Error: {} is not a valid directory", dir.display());
        std::process::exit(1);
    }

    let out_dir = cli.out_dir.clone().unwrap_or_else(|| dir.join(".processed"));

    if !cli.dry_run {
        fs::create_dir_all(&out_dir).unwrap_or_else(|e| {
            eprintln!("Error creating output directory {}: {}", out_dir.display(), e);
            std::process::exit(1);
        });
    }

    let mut total_files = 0;
    let mut total_transformed = 0;

    process_dir_recursive(transformer, dir, &out_dir, dir, cli, &mut total_files, &mut total_transformed);

    if cli.verbose || total_transformed > 0 {
        eprintln!(
            "Processed {} files, {} had msg.sender transformations applied",
            total_files, total_transformed
        );
    }
}

fn process_dir_recursive(
    transformer: &MsgSenderTransformer,
    current: &Path,
    out_base: &Path,
    src_base: &Path,
    cli: &Cli,
    total_files: &mut usize,
    total_transformed: &mut usize,
) {
    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("Error reading directory {}: {}", current.display(), e);
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        if path.is_dir() {
            // Skip .processed directory to avoid recursion
            if path.file_name().is_some_and(|n| n == ".processed") {
                continue;
            }
            process_dir_recursive(transformer, &path, out_base, src_base, cli, total_files, total_transformed);
        } else if path.extension().is_some_and(|ext| ext == "sol") {
            *total_files += 1;

            let source = match fs::read_to_string(&path) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Error reading {}: {}", path.display(), e);
                    continue;
                }
            };

            let result = transformer.transform(&source);

            if result.functions_transformed > 0 || result.modifiers_transformed > 0 {
                *total_transformed += 1;

                if cli.verbose {
                    eprintln!(
                        "  {} -> {} functions, {} modifiers transformed",
                        path.display(),
                        result.functions_transformed,
                        result.modifiers_transformed
                    );
                }
            }

            if !cli.dry_run {
                // Compute relative path and create output path
                let relative = path.strip_prefix(src_base).unwrap_or(&path);
                let out_path = out_base.join(relative);

                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent).unwrap_or_else(|e| {
                        eprintln!("Error creating directory {}: {}", parent.display(), e);
                    });
                }

                fs::write(&out_path, &result.output).unwrap_or_else(|e| {
                    eprintln!("Error writing {}: {}", out_path.display(), e);
                });
            } else if result.functions_transformed > 0 {
                println!("--- {} ---", path.display());
                println!("{}", result.output);
            }
        }
    }
}
