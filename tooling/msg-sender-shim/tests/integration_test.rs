// SPDX-License-Identifier: Apache-2.0
//
// Integration tests for the msg-sender-shim preprocessor.
// These tests validate end-to-end transformation of realistic Solidity contracts.

use std::process::Command;
use std::path::Path;
use tempfile::TempDir;
use std::fs;

/// Get the path to the compiled binary
fn binary_path() -> String {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    format!("{}/target/debug/msg-sender-shim", manifest_dir)
}

/// Build the binary before running tests
fn ensure_built() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let status = Command::new("cargo")
        .args(["build"])
        .current_dir(manifest_dir)
        .status()
        .expect("Failed to build");
    assert!(status.success(), "Build failed");
}

/// Helper: check that output contains no msg.sender in executable code
fn assert_no_msg_sender_in_code(output: &str) {
    for (i, line) in output.lines().enumerate() {
        let trimmed = line.trim_start();
        if !trimmed.starts_with("//") && trimmed.contains("msg.sender") {
            panic!(
                "Line {} still contains msg.sender in code: {}",
                i + 1,
                line
            );
        }
    }
}

#[test]
fn test_single_file_ownership_pattern() {
    ensure_built();

    let src = r#"pragma solidity ^0.8.0;
contract Owned {
    address public owner;
    constructor() {
        owner = msg.sender;
    }
    function doStuff() public {
        require(msg.sender == owner, "not owner");
        // do stuff
    }
}
"#;

    let tmp = TempDir::new().unwrap();
    let input_path = tmp.path().join("Owned.sol");
    let output_path = tmp.path().join("Owned.processed.sol");
    fs::write(&input_path, src).unwrap();

    let output = Command::new(binary_path())
        .args([
            input_path.to_str().unwrap(),
            "-o",
            output_path.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let result = fs::read_to_string(&output_path).unwrap();
    assert_no_msg_sender_in_code(&result);
    assert!(result.contains("owner.requireAuth()"));
    assert!(result.contains("_caller"));
}

#[test]
fn test_single_file_erc20_pattern() {
    ensure_built();

    let src = r#"pragma solidity ^0.8.0;
contract Token {
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowances[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(allowances[from][msg.sender] >= amount, "insufficient allowance");
        allowances[from][msg.sender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;
        return true;
    }
}
"#;

    let tmp = TempDir::new().unwrap();
    let input_path = tmp.path().join("Token.sol");
    let output_path = tmp.path().join("Token.processed.sol");
    fs::write(&input_path, src).unwrap();

    let output = Command::new(binary_path())
        .args([
            input_path.to_str().unwrap(),
            "-o",
            output_path.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let result = fs::read_to_string(&output_path).unwrap();
    assert_no_msg_sender_in_code(&result);

    // Transfer should have _caller param and auth
    assert!(result.contains("address _caller, address to"));
    assert!(result.contains("_caller.requireAuth()"));
    assert!(result.contains("balances[_caller]"));

    // TransferFrom should also have _caller
    assert!(result.contains("address _caller, address from"));
    assert!(result.contains("allowances[from][_caller]"));
}

#[test]
fn test_directory_mode() {
    ensure_built();

    let tmp = TempDir::new().unwrap();
    let src_dir = tmp.path().join("contracts");
    let out_dir = tmp.path().join("processed");
    fs::create_dir_all(&src_dir).unwrap();

    // Write multiple contracts
    fs::write(
        src_dir.join("A.sol"),
        r#"pragma solidity ^0.8.0;
contract A {
    address owner;
    function foo() public {
        require(msg.sender == owner);
    }
}
"#,
    ).unwrap();

    fs::write(
        src_dir.join("B.sol"),
        r#"pragma solidity ^0.8.0;
contract B {
    function bar() public pure returns (uint256) {
        return 42;
    }
}
"#,
    ).unwrap();

    fs::write(
        src_dir.join("C.sol"),
        r#"pragma solidity ^0.8.0;
contract C {
    mapping(address => uint256) balances;
    function get() public view returns (uint256) {
        return balances[msg.sender];
    }
}
"#,
    ).unwrap();

    let output = Command::new(binary_path())
        .args([
            "--dir",
            src_dir.to_str().unwrap(),
            "--out-dir",
            out_dir.to_str().unwrap(),
            "--verbose",
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    // Check all outputs exist
    assert!(out_dir.join("A.sol").exists());
    assert!(out_dir.join("B.sol").exists());
    assert!(out_dir.join("C.sol").exists());

    // A.sol should be transformed
    let a_result = fs::read_to_string(out_dir.join("A.sol")).unwrap();
    assert_no_msg_sender_in_code(&a_result);
    assert!(a_result.contains("owner.requireAuth()"));

    // B.sol should be unchanged (no msg.sender)
    let b_result = fs::read_to_string(out_dir.join("B.sol")).unwrap();
    assert!(b_result.contains("return 42"));

    // C.sol should be transformed
    let c_result = fs::read_to_string(out_dir.join("C.sol")).unwrap();
    assert_no_msg_sender_in_code(&c_result);
    assert!(c_result.contains("balances[_caller]"));
}

#[test]
fn test_modifier_injection() {
    ensure_built();

    let src = r#"pragma solidity ^0.8.0;
contract Guarded {
    address public owner;
    uint256 public value;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setValue(uint256 v) public onlyOwner {
        value = v;
    }

    function getValue() public view returns (uint256) {
        return value;
    }
}
"#;

    let tmp = TempDir::new().unwrap();
    let input_path = tmp.path().join("Guarded.sol");
    let output_path = tmp.path().join("Guarded.processed.sol");
    fs::write(&input_path, src).unwrap();

    let output = Command::new(binary_path())
        .args([
            input_path.to_str().unwrap(),
            "-o",
            output_path.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let result = fs::read_to_string(&output_path).unwrap();
    assert_no_msg_sender_in_code(&result);

    // Modifier should be commented out
    assert!(result.contains("Modifier 'onlyOwner' transformed"));

    // setValue should have owner.requireAuth() injected
    assert!(result.contains("owner.requireAuth()"));

    // The modifier name should be removed from function signature
    assert!(!result.contains("onlyOwner {") && !result.contains("onlyOwner{"));

    // getValue should be unchanged
    assert!(result.contains("function getValue()"));
}

#[test]
fn test_custom_caller_name() {
    ensure_built();

    let src = r#"pragma solidity ^0.8.0;
contract Foo {
    mapping(address => uint256) balances;
    function get() public view returns (uint256) {
        return balances[msg.sender];
    }
}
"#;

    let tmp = TempDir::new().unwrap();
    let input_path = tmp.path().join("Foo.sol");
    fs::write(&input_path, src).unwrap();

    let output = Command::new(binary_path())
        .args([
            input_path.to_str().unwrap(),
            "--caller-name",
            "_invoker",
            "--dry-run",
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let result = String::from_utf8(output.stdout).unwrap();
    assert!(result.contains("_invoker"));
    assert!(result.contains("address _invoker"));
    assert!(result.contains("balances[_invoker]"));
}

#[test]
fn test_keep_requires_flag() {
    ensure_built();

    let src = r#"pragma solidity ^0.8.0;
contract Foo {
    address owner;
    function foo() public {
        require(msg.sender == owner, "not owner");
        doStuff();
    }
}
"#;

    let tmp = TempDir::new().unwrap();
    let input_path = tmp.path().join("Foo.sol");
    fs::write(&input_path, src).unwrap();

    let output = Command::new(binary_path())
        .args([
            input_path.to_str().unwrap(),
            "--keep-requires",
            "--dry-run",
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let result = String::from_utf8(output.stdout).unwrap();
    // With --keep-requires, the require statement should remain (but msg.sender is replaced)
    // The require(msg.sender == owner) won't be removed, but msg.sender is replaced with _caller
    // In this case with OwnershipCheck pattern, _caller won't be added (no mapping/general usage)
    // So the require remains as-is but the auth is still added
    assert!(result.contains("owner.requireAuth()"));
}

#[test]
fn test_no_transformation_needed() {
    ensure_built();

    let src = r#"pragma solidity ^0.8.0;
contract NoSender {
    uint256 public value;
    function set(uint256 v) public {
        value = v;
    }
    function get() public view returns (uint256) {
        return value;
    }
}
"#;

    let tmp = TempDir::new().unwrap();
    let input_path = tmp.path().join("NoSender.sol");
    fs::write(&input_path, src).unwrap();

    let output = Command::new(binary_path())
        .args([input_path.to_str().unwrap(), "--dry-run"])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let result = String::from_utf8(output.stdout).unwrap();
    // Output should be identical to input
    assert_eq!(result.trim(), src.trim());
}

#[test]
fn test_verbose_output() {
    ensure_built();

    let src = r#"pragma solidity ^0.8.0;
contract Foo {
    mapping(address => uint256) balances;
    function get() public view returns (uint256) {
        return balances[msg.sender];
    }
}
"#;

    let tmp = TempDir::new().unwrap();
    let input_path = tmp.path().join("Foo.sol");
    fs::write(&input_path, src).unwrap();

    let output = Command::new(binary_path())
        .args([input_path.to_str().unwrap(), "--verbose", "--dry-run"])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let stderr = String::from_utf8(output.stderr).unwrap();
    assert!(stderr.contains("Transformation Report"));
    assert!(stderr.contains("Functions transformed: 1"));
}

#[test]
fn test_actual_test_contracts() {
    ensure_built();

    let contracts_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent().unwrap()
        .parent().unwrap()
        .join("contracts")
        .join("test");

    if !contracts_dir.exists() {
        return; // Skip if test contracts don't exist
    }

    let tmp = TempDir::new().unwrap();
    let out_dir = tmp.path().join("processed");

    let output = Command::new(binary_path())
        .args([
            "--dir",
            contracts_dir.to_str().unwrap(),
            "--out-dir",
            out_dir.to_str().unwrap(),
            "--verbose",
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let stderr = String::from_utf8(output.stderr).unwrap();
    assert!(stderr.contains("Processed"));

    // Verify all output files have no msg.sender in code
    for entry in fs::read_dir(&out_dir).unwrap() {
        let entry = entry.unwrap();
        if entry.path().extension().map_or(false, |ext| ext == "sol") {
            let content = fs::read_to_string(entry.path()).unwrap();
            assert_no_msg_sender_in_code(&content);
        }
    }
}

#[test]
fn test_complex_erc20_all_patterns() {
    ensure_built();

    let src = r#"pragma solidity ^0.8.0;
contract FullERC20 {
    string public name;
    uint256 public totalSupply;
    address public owner;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(string memory _name) {
        name = _name;
        owner = msg.sender;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function mint(address to, uint256 amount) public onlyOwner {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function burn(uint256 amount) public {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
    }

    function renounceOwnership() public {
        require(msg.sender == owner, "not owner");
        owner = address(0);
    }
}
"#;

    let tmp = TempDir::new().unwrap();
    let input_path = tmp.path().join("FullERC20.sol");
    let output_path = tmp.path().join("FullERC20.processed.sol");
    fs::write(&input_path, src).unwrap();

    let output = Command::new(binary_path())
        .args([
            input_path.to_str().unwrap(),
            "-o",
            output_path.to_str().unwrap(),
            "--verbose",
        ])
        .output()
        .expect("Failed to execute");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let result = fs::read_to_string(&output_path).unwrap();
    assert_no_msg_sender_in_code(&result);

    // Constructor should have _caller param
    assert!(result.contains("address _caller"));

    // transfer should use _caller
    assert!(result.contains("balanceOf[_caller]"));

    // approve should use _caller for allowance
    assert!(result.contains("allowance[_caller]"));

    // transferFrom should use _caller for the spender
    assert!(result.contains("allowance[from][_caller]"));

    // mint should have owner.requireAuth() (from modifier)
    assert!(result.contains("owner.requireAuth()"));

    // burn should have _caller.requireAuth()
    assert!(result.contains("_caller.requireAuth()"));

    // renounceOwnership should have owner.requireAuth()
    // (ownership check pattern)
    let renounce_section: String = result.lines()
        .skip_while(|l| !l.contains("renounceOwnership"))
        .take(10)
        .collect::<Vec<_>>()
        .join("\n");
    assert!(renounce_section.contains("owner.requireAuth()"),
        "renounceOwnership should have owner.requireAuth():\n{}", renounce_section);
}
