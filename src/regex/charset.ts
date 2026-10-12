/** Number of characters in the supported alphabet, U+0000 to U+007F. */
export const ASCII_SIZE = 128;

const ALL_BITS = (1n << BigInt(ASCII_SIZE)) - 1n;

function asciiCode(char: string): number {
  const code = char.charCodeAt(0);
  if (char.length !== 1 || code >= ASCII_SIZE) {
    throw new RangeError(`Expected a single ASCII character, got ${JSON.stringify(char)}`);
  }
  return code;
}

/** An immutable set of ASCII characters. */
export class CharSet {
  static readonly EMPTY = new CharSet(0n);
  static readonly ALL = new CharSet(ALL_BITS);

  // Bit `n` is set when the character with code `n` is a member.
  private constructor(private readonly bits: bigint) {}

  /** The set of all characters that occur in `chars`. */
  static of(chars: string): CharSet {
    let bits = 0n;
    for (const char of chars) bits |= 1n << BigInt(asciiCode(char));
    return new CharSet(bits);
  }

  /** The set of all characters from `first` to `last`, both inclusive. */
  static range(first: string, last: string): CharSet {
    const firstCode = asciiCode(first);
    const lastCode = asciiCode(last);
    if (firstCode > lastCode) {
      throw new RangeError(`Range ${JSON.stringify(first)}-${JSON.stringify(last)} is out of order`);
    }
    const width = BigInt(lastCode - firstCode + 1);
    return new CharSet(((1n << width) - 1n) << BigInt(firstCode));
  }

  get isEmpty(): boolean {
    return this.bits === 0n;
  }

  get size(): number {
    return this.ranges().reduce((count, [first, last]) => count + last - first + 1, 0);
  }

  has(char: string): boolean {
    const code = char.charCodeAt(0);
    return char.length === 1 && code < ASCII_SIZE && this.hasCode(code);
  }

  union(other: CharSet): CharSet {
    return new CharSet(this.bits | other.bits);
  }

  /** All ASCII characters that are not in this set. */
  complement(): CharSet {
    return new CharSet(this.bits ^ ALL_BITS);
  }

  equals(other: CharSet): boolean {
    return this.bits === other.bits;
  }

  /** The maximal runs of consecutive member codes, as inclusive pairs in ascending order. */
  ranges(): [first: number, last: number][] {
    const ranges: [number, number][] = [];
    let first: number | null = null;
    for (let code = 0; code <= ASCII_SIZE; code++) {
      const member = code < ASCII_SIZE && this.hasCode(code);
      if (member && first === null) first = code;
      if (!member && first !== null) {
        ranges.push([first, code - 1]);
        first = null;
      }
    }
    return ranges;
  }

  private hasCode(code: number): boolean {
    return ((this.bits >> BigInt(code)) & 1n) === 1n;
  }
}
