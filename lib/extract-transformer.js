/* eslint-env browser */

/**
 * Tranform stream that extracts `length` bytes starting at `offset` and turns
 * that result into a new stream. If the input stream ends before `length` bytes,
 * the output stream will error.
 *
 * offset: The number of bytes to skip before starting the output stream
 * length: The number of bytes to include in the output stream. All further
 *         input data will be discarded.
 */

export class ExtractTransformer {
  constructor (offset, length) {
    // desired range to extract
    this.extractStart = offset
    this.extractEnd = offset + length // exclusive end

    this.offset = 0 // current offset into input stream
  }

  transform (chunk, controller) {
    // The start and end of `chunk` relative to the entire input stream
    const chunkStart = this.offset
    const chunkEnd = this.offset + chunk.byteLength // exclusive end
    this.offset = chunkEnd

    // What part of `chunk` belongs in the output stream?
    const sliceStart = Math.max(this.extractStart - chunkStart, 0)
    const sliceEnd = Math.min(this.extractEnd - chunkStart, chunk.byteLength)

    // This chunk is entirely outside the range to extract
    if (sliceStart >= chunk.byteLength || sliceEnd <= 0) {
      return
    }

    controller.enqueue(chunk.subarray(sliceStart, sliceEnd))
  }

  flush (controller) {
    if (this.offset < this.extractEnd) {
      controller.error(new Error('Stream passed through ExtractTransformer ended early'))
    }
  }
}
