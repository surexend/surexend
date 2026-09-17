'use strict'

/*
 * This is not a general-purpose replacement for elliptic. It implements only
 * the secp256k1 EC surface consumed by @ethersproject/signing-key@5.8.0:
 * keyFromPrivate, keyFromPublic, getPublic, sign, derive, pub.add, and
 * recoverPubKey. The actual curve arithmetic is delegated to noble-curves,
 * an audited library already used by the Circle/Solana dependency graph.
 *
 * Keeping this adapter deliberately small prevents accidental use as a drop-in
 * for unrelated elliptic curves. Unsupported curves and APIs fail closed.
 */
const { secp256k1 } = require('@noble/curves/secp256k1')

function hex(bytes) {
  return Buffer.from(bytes).toString('hex')
}

function bytes(value) {
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return Uint8Array.from(value)
  if (typeof value === 'string') {
    const normalized = value.startsWith('0x') ? value.slice(2) : value
    if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
      throw new Error('Invalid secp256k1 key encoding')
    }
    return Uint8Array.from(Buffer.from(normalized, 'hex'))
  }
  if (Array.isArray(value)) return Uint8Array.from(value)
  throw new TypeError('Unsupported secp256k1 key encoding')
}

function format(bytesValue, encoding) {
  if (encoding === 'hex') return hex(bytesValue)
  if (!encoding) return Uint8Array.from(bytesValue)
  throw new Error(`Unsupported elliptic encoding: ${encoding}`)
}

class Point {
  constructor(point) {
    this.point = point
  }

  add(other) {
    return new Point(this.point.add(other.point))
  }

  encode(encoding, compact) {
    return format(this.point.toRawBytes(Boolean(compact)), encoding)
  }

  encodeCompressed(encoding) {
    return format(this.point.toRawBytes(true), encoding)
  }

  toRawBytes(compact) {
    return this.point.toRawBytes(Boolean(compact))
  }
}

class KeyPair {
  constructor(privateKey, publicKey) {
    this.privateKey = privateKey ? bytes(privateKey) : undefined
    const point = publicKey || (this.privateKey ? secp256k1.ProjectivePoint.fromPrivateKey(this.privateKey) : undefined)
    if (!point) throw new Error('A private or public secp256k1 key is required')
    this.pub = point instanceof Point ? point : new Point(point)
  }

  getPublic(compact, encoding) {
    return format(this.pub.toRawBytes(Boolean(compact)), encoding)
  }

  sign(digest, options = {}) {
    if (!this.privateKey) throw new Error('Cannot sign with a public-only key')
    const signature = secp256k1.sign(bytes(digest), this.privateKey, {
      lowS: Boolean(options.canonical),
    })
    return {
      r: signature.r,
      s: signature.s,
      recoveryParam: signature.recovery,
    }
  }

  derive(otherPublicKey) {
    if (!this.privateKey) throw new Error('Cannot derive with a public-only key')
    const shared = secp256k1.getSharedSecret(this.privateKey, otherPublicKey.toRawBytes(true), false)
    return BigInt(`0x${hex(shared.slice(1))}`)
  }
}

class EC {
  constructor(name) {
    if (name !== 'secp256k1') throw new Error(`Unsupported elliptic curve: ${name}`)
  }

  keyFromPrivate(privateKey) {
    return new KeyPair(privateKey)
  }

  keyFromPublic(publicKey) {
    return new KeyPair(undefined, new Point(secp256k1.ProjectivePoint.fromHex(bytes(publicKey))))
  }

  recoverPubKey(digest, signature, recoveryParam) {
    const compact = Buffer.concat([
      Buffer.from(bytes(signature.r)),
      Buffer.from(bytes(signature.s)),
    ])
    return new Point(secp256k1.Signature.fromCompact(compact)
      .addRecoveryBit(Number(recoveryParam))
      .recoverPublicKey(bytes(digest)))
  }
}

module.exports = { ec: EC }
module.exports.default = module.exports
