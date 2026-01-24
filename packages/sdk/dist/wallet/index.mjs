import { StrKey, Keypair, xdr } from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import * as secp256k1 from '@noble/secp256k1';
import * as ed25519 from '@noble/ed25519';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';

// src/wallet/keys.ts
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));
function deriveSecp256k1KeyFromSeed(seed, path) {
  const I = hmac(sha512, new TextEncoder().encode("Bitcoin seed"), seed);
  let key = new Uint8Array(I.slice(0, 32));
  let chainCode = new Uint8Array(I.slice(32));
  const segments = path.replace(/^m\//, "").split("/").map((s) => {
    const hardened = s.endsWith("'");
    const index = parseInt(s.replace("'", ""), 10);
    return { index, hardened };
  });
  for (const segment of segments) {
    const indexBuffer = new Uint8Array(4);
    const view = new DataView(indexBuffer.buffer);
    let data;
    if (segment.hardened) {
      const hardenedIndex = segment.index | 2147483648;
      view.setUint32(0, hardenedIndex, false);
      data = new Uint8Array(1 + 32 + 4);
      data[0] = 0;
      data.set(key, 1);
      data.set(indexBuffer, 33);
    } else {
      view.setUint32(0, segment.index, false);
      const publicKey = secp256k1.getPublicKey(key, true);
      data = new Uint8Array(33 + 4);
      data.set(publicKey, 0);
      data.set(indexBuffer, 33);
    }
    const I2 = hmac(sha512, chainCode, data);
    const IL = new Uint8Array(I2.slice(0, 32));
    chainCode = new Uint8Array(I2.slice(32));
    const parentKeyBigInt = bytesToBigInt(key);
    const ILBigInt = bytesToBigInt(IL);
    const n = BigInt(
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
    );
    const childKeyBigInt = (ILBigInt + parentKeyBigInt) % n;
    key = bigIntToBytes(childKeyBigInt, 32);
  }
  return key;
}
function bytesToBigInt(bytes) {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = result << BigInt(8) | BigInt(bytes[i]);
  }
  return result;
}
function bigIntToBytes(value, length) {
  const result = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    result[i] = Number(v & BigInt(255));
    v = v >> BigInt(8);
  }
  return result;
}
function publicKeyToEvmAddress(publicKey) {
  const keyWithoutPrefix = publicKey.length === 65 ? publicKey.slice(1) : publicKey;
  const hash = keccak_256(keyWithoutPrefix);
  const addressBytes = new Uint8Array(hash.slice(-20));
  const hex = Array.from(addressBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}
function publicKeyToStellarAddress(publicKey) {
  return StrKey.encodeEd25519PublicKey(Buffer.from(publicKey));
}
function generateMnemonic2(strength = 256) {
  return bip39.generateMnemonic(strength);
}
function validateMnemonic2(mnemonic) {
  return bip39.validateMnemonic(mnemonic);
}
async function deriveKeyPairFromMnemonic(mnemonic, accountIndex = 0) {
  if (!validateMnemonic2(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const seedArray = new Uint8Array(seed);
  const evmPath = `m/44'/60'/0'/0/${accountIndex}`;
  const evmPrivateKey = deriveSecp256k1KeyFromSeed(seedArray, evmPath);
  const evmPublicKey = secp256k1.getPublicKey(evmPrivateKey, false);
  const stellarSeed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode("TVA-STELLAR-KEY"),
      ...evmPrivateKey
    ])
  );
  const stellarKeypair = Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));
  return {
    evmPrivateKey: `0x${Buffer.from(evmPrivateKey).toString("hex")}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString("hex")}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey()
  };
}
function deriveKeyPairFromEvmPrivateKey(evmPrivateKey) {
  const privateKeyHex = evmPrivateKey.replace(/^0x/, "");
  const privateKeyBytes = Buffer.from(privateKeyHex, "hex");
  if (privateKeyBytes.length !== 32) {
    throw new Error("Invalid private key length");
  }
  const evmPublicKey = secp256k1.getPublicKey(privateKeyBytes, false);
  const stellarSeed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode("TVA-STELLAR-KEY"),
      ...privateKeyBytes
    ])
  );
  const stellarKeypair = Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));
  return {
    evmPrivateKey: `0x${privateKeyHex}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString("hex")}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey()
  };
}
function generateRandomKeyPair() {
  const mnemonic = generateMnemonic2();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const seedArray = new Uint8Array(seed);
  const evmPath = `m/44'/60'/0'/0/0`;
  const evmPrivateKey = deriveSecp256k1KeyFromSeed(seedArray, evmPath);
  const evmPublicKey = secp256k1.getPublicKey(evmPrivateKey, false);
  const stellarSeed = sha256(
    new Uint8Array([
      ...new TextEncoder().encode("TVA-STELLAR-KEY"),
      ...evmPrivateKey
    ])
  );
  const stellarKeypair = Keypair.fromRawEd25519Seed(Buffer.from(stellarSeed));
  return {
    evmPrivateKey: `0x${Buffer.from(evmPrivateKey).toString("hex")}`,
    evmPublicKey: `0x${Buffer.from(evmPublicKey).toString("hex")}`,
    stellarSecretKey: stellarKeypair.secret(),
    stellarPublicKey: stellarKeypair.publicKey()
  };
}
function getEvmAddress(keyPair) {
  const publicKeyBytes = Buffer.from(keyPair.evmPublicKey.replace(/^0x/, ""), "hex");
  return publicKeyToEvmAddress(publicKeyBytes);
}
function getStellarAddress(keyPair) {
  return keyPair.stellarPublicKey;
}
function verifyEvmAddress(address, publicKey) {
  const publicKeyBytes = Buffer.from(publicKey.replace(/^0x/, ""), "hex");
  const derivedAddress = publicKeyToEvmAddress(publicKeyBytes);
  return derivedAddress.toLowerCase() === address.toLowerCase();
}
function verifyStellarAddress(address, publicKey) {
  return address === publicKey;
}

// src/types/index.ts
var TVA_CHAIN_ID = 1414676736;
var NETWORKS = {
  testnet: {
    type: "testnet",
    rpcUrl: "http://localhost:8545",
    // TVA RPC server
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    chainId: TVA_CHAIN_ID,
    nativeCurrency: {
      name: "Stellar Lumens",
      symbol: "XLM",
      decimals: 7
    }
  },
  mainnet: {
    type: "mainnet",
    rpcUrl: "http://localhost:8545",
    // TVA RPC server (production URL TBD)
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    chainId: TVA_CHAIN_ID,
    nativeCurrency: {
      name: "Stellar Lumens",
      symbol: "XLM",
      decimals: 7
    }
  },
  local: {
    type: "local",
    rpcUrl: "http://localhost:8545",
    horizonUrl: "http://localhost:8000",
    sorobanRpcUrl: "http://localhost:8001",
    networkPassphrase: "Standalone Network ; February 2017",
    chainId: TVA_CHAIN_ID,
    nativeCurrency: {
      name: "Stellar Lumens",
      symbol: "XLM",
      decimals: 7
    }
  }
};

// src/wallet/signer.ts
secp256k1.etc.hmacSha256Sync = (k, ...m) => hmac(sha256, k, secp256k1.etc.concatBytes(...m));
var EvmSigner = class {
  privateKey;
  address;
  constructor(keyPair) {
    this.privateKey = Buffer.from(
      keyPair.evmPrivateKey.replace(/^0x/, ""),
      "hex"
    );
    this.address = getEvmAddress(keyPair);
  }
  /**
   * Signs a message hash using secp256k1
   */
  signHash(hash) {
    const signature = secp256k1.sign(hash, this.privateKey);
    const r = signature.r.toString(16).padStart(64, "0");
    const s = signature.s.toString(16).padStart(64, "0");
    const v = signature.recovery + 27;
    return { r: `0x${r}`, s: `0x${s}`, v };
  }
  /**
   * Signs a personal message (EIP-191)
   */
  signMessage(message) {
    const messageBytes = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode(
      `Ethereum Signed Message:
${messageBytes.length}`
    );
    const prefixedMessage = new Uint8Array([...prefix, ...messageBytes]);
    const hash = keccak_256(prefixedMessage);
    const { r, s, v } = this.signHash(hash);
    return `${r}${s.slice(2)}${v.toString(16).padStart(2, "0")}`;
  }
  /**
   * Signs typed data (EIP-712)
   */
  signTypedData(domain, types, value) {
    const domainSeparator = this.hashStruct("EIP712Domain", domain, {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ]
    });
    const primaryType = Object.keys(types).find((t) => t !== "EIP712Domain");
    if (!primaryType) {
      throw new Error("No primary type found");
    }
    const structHash = this.hashStruct(primaryType, value, types);
    const messageHash = keccak_256(
      new Uint8Array([25, 1, ...domainSeparator, ...structHash])
    );
    const { r, s, v } = this.signHash(messageHash);
    return `${r}${s.slice(2)}${v.toString(16).padStart(2, "0")}`;
  }
  hashStruct(typeName, data, types) {
    const typeHash = keccak_256(
      new TextEncoder().encode(this.encodeType(typeName, types))
    );
    const encodedData = this.encodeData(typeName, data, types);
    return keccak_256(new Uint8Array([...typeHash, ...encodedData]));
  }
  encodeType(primaryType, types) {
    const fields = types[primaryType];
    if (!fields) {
      return primaryType;
    }
    const fieldDefs = fields.map((f) => `${f.type} ${f.name}`).join(",");
    return `${primaryType}(${fieldDefs})`;
  }
  encodeData(typeName, data, types) {
    const fields = types[typeName];
    if (!fields) {
      throw new Error(`Unknown type: ${typeName}`);
    }
    const parts = [];
    for (const field of fields) {
      const value = data[field.name];
      parts.push(this.encodeValue(field.type, value, types));
    }
    return new Uint8Array(parts.flatMap((p) => [...p]));
  }
  encodeValue(type, value, types) {
    if (type === "string") {
      return keccak_256(new TextEncoder().encode(value));
    }
    if (type === "bytes") {
      const bytes = Buffer.from(value.replace(/^0x/, ""), "hex");
      return keccak_256(bytes);
    }
    if (type === "address") {
      const addr = value.replace(/^0x/, "").toLowerCase();
      const padded = new Uint8Array(32);
      const addrBytes = Buffer.from(addr, "hex");
      padded.set(addrBytes, 32 - addrBytes.length);
      return padded;
    }
    if (type.startsWith("uint") || type.startsWith("int")) {
      const num = BigInt(value);
      const bytes = new Uint8Array(32);
      let val = num;
      for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(val & BigInt(255));
        val = val >> BigInt(8);
      }
      return bytes;
    }
    if (type === "bool") {
      const bytes = new Uint8Array(32);
      bytes[31] = value ? 1 : 0;
      return bytes;
    }
    if (types[type]) {
      return this.hashStruct(type, value, types);
    }
    throw new Error(`Unsupported type: ${type}`);
  }
  /**
   * Signs an EVM transaction and returns the signed raw transaction
   */
  signTransaction(tx) {
    const encodedTx = this.rlpEncodeTransaction(tx);
    const hash = keccak_256(encodedTx);
    const signature = this.signHash(hash);
    const v = tx.chainId * 2 + 35 + (signature.v - 27);
    return this.rlpEncodeSignedTransaction(tx, {
      r: signature.r,
      s: signature.s,
      v
    });
  }
  rlpEncodeTransaction(tx) {
    const items = [
      tx.nonce,
      tx.gasPrice,
      tx.gasLimit,
      tx.to || "",
      tx.value,
      tx.data,
      tx.chainId,
      0,
      0
    ];
    return this.rlpEncode(items);
  }
  rlpEncodeSignedTransaction(tx, sig) {
    const items = [
      tx.nonce,
      tx.gasPrice,
      tx.gasLimit,
      tx.to || "",
      tx.value,
      tx.data,
      sig.v,
      sig.r,
      sig.s
    ];
    const encoded = this.rlpEncode(items);
    return "0x" + Buffer.from(encoded).toString("hex");
  }
  rlpEncode(input) {
    if (Array.isArray(input)) {
      const encodedItems = input.map((item) => this.rlpEncode(item));
      const totalLength = encodedItems.reduce((sum, item) => sum + item.length, 0);
      const flatItems = encodedItems.flatMap((item) => Array.from(item));
      if (totalLength < 56) {
        return new Uint8Array([192 + totalLength, ...flatItems]);
      } else {
        const lengthBytes2 = this.encodeBigEndian(totalLength);
        return new Uint8Array([
          247 + lengthBytes2.length,
          ...Array.from(lengthBytes2),
          ...flatItems
        ]);
      }
    }
    const bytes = this.toBytes(input);
    if (bytes.length === 1 && bytes[0] < 128) {
      return bytes;
    }
    if (bytes.length < 56) {
      return new Uint8Array([128 + bytes.length, ...Array.from(bytes)]);
    }
    const lengthBytes = this.encodeBigEndian(bytes.length);
    return new Uint8Array([183 + lengthBytes.length, ...Array.from(lengthBytes), ...Array.from(bytes)]);
  }
  toBytes(input) {
    if (input === null || input === "" || input === 0 || input === BigInt(0)) {
      return new Uint8Array(0);
    }
    if (input instanceof Uint8Array) {
      return input;
    }
    if (typeof input === "string") {
      if (input.startsWith("0x")) {
        const hex = input.slice(2);
        if (hex.length === 0) {
          return new Uint8Array(0);
        }
        return Buffer.from(hex.padStart(hex.length + hex.length % 2, "0"), "hex");
      }
      return new TextEncoder().encode(input);
    }
    if (typeof input === "number" || typeof input === "bigint") {
      return this.encodeBigEndian(input);
    }
    throw new Error(`Cannot encode: ${input}`);
  }
  encodeBigEndian(value) {
    if (value === 0 || value === BigInt(0)) {
      return new Uint8Array(0);
    }
    const bytes = [];
    let v = BigInt(value);
    while (v > 0) {
      bytes.unshift(Number(v & BigInt(255)));
      v = v >> BigInt(8);
    }
    return new Uint8Array(bytes);
  }
};
var StellarSigner = class {
  keypair;
  publicKey;
  constructor(keyPair) {
    this.keypair = Keypair.fromSecret(keyPair.stellarSecretKey);
    this.publicKey = this.keypair.publicKey();
  }
  /**
   * Signs a Stellar transaction
   */
  signTransaction(transaction, _networkPassphrase) {
    transaction.sign(this.keypair);
    return transaction;
  }
  /**
   * Signs arbitrary data
   */
  signData(data) {
    return this.keypair.sign(Buffer.from(data));
  }
  /**
   * Verifies a signature
   */
  verifySignature(data, signature) {
    return this.keypair.verify(Buffer.from(data), Buffer.from(signature));
  }
  /**
   * Signs a Soroban authorization entry
   */
  signAuthEntry(entry, networkPassphrase, validUntilLedger) {
    const signedEntry = xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());
    const credentials = signedEntry.credentials();
    if (credentials.switch().value === 0) {
      return signedEntry;
    }
    const addressCredentials = credentials.address();
    const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId: Buffer.from(sha256(new TextEncoder().encode(networkPassphrase))),
        nonce: addressCredentials.nonce(),
        signatureExpirationLedger: validUntilLedger,
        invocation: signedEntry.rootInvocation()
      })
    );
    const preimageHash = sha256(preimage.toXDR());
    const signature = this.keypair.sign(Buffer.from(preimageHash));
    const newCredentials = new xdr.SorobanAddressCredentials({
      address: addressCredentials.address(),
      nonce: addressCredentials.nonce(),
      signatureExpirationLedger: validUntilLedger,
      signature: xdr.ScVal.scvVec([
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("public_key"),
            val: xdr.ScVal.scvBytes(this.keypair.rawPublicKey())
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("signature"),
            val: xdr.ScVal.scvBytes(signature)
          })
        ])
      ])
    });
    signedEntry.credentials(xdr.SorobanCredentials.sorobanCredentialsAddress(newCredentials));
    return signedEntry;
  }
};
var TVASigner = class {
  evmSigner;
  stellarSigner;
  keyPair;
  network;
  constructor(keyPair, network = "testnet") {
    this.keyPair = keyPair;
    this.network = NETWORKS[network];
    this.evmSigner = new EvmSigner(keyPair);
    this.stellarSigner = new StellarSigner(keyPair);
  }
  get evmAddress() {
    return this.evmSigner.address;
  }
  get stellarAddress() {
    return this.stellarSigner.publicKey;
  }
  /**
   * Signs an EVM-format transaction
   */
  signEvmTransaction(tx) {
    return this.evmSigner.signTransaction(tx);
  }
  /**
   * Signs a Stellar transaction
   */
  signStellarTransaction(transaction) {
    return this.stellarSigner.signTransaction(
      transaction,
      this.network.networkPassphrase
    );
  }
  /**
   * Signs a personal message (for wallet connect / dapp signatures)
   */
  signMessage(message) {
    return this.evmSigner.signMessage(message);
  }
};

export { EvmSigner, StellarSigner, TVASigner, deriveKeyPairFromEvmPrivateKey, deriveKeyPairFromMnemonic, generateMnemonic2 as generateMnemonic, generateRandomKeyPair, getEvmAddress, getStellarAddress, publicKeyToEvmAddress, publicKeyToStellarAddress, validateMnemonic2 as validateMnemonic, verifyEvmAddress, verifyStellarAddress };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map