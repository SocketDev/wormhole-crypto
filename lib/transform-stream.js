/* eslint-env browser */
/* global TransformStream */

/**
 * Pipe a readable stream through a transformer. Returns a result, where
 * result.readable is the readable end of the TransformStream and
 * result.done is a promise that fulfills or rejects once the stream is done.
 * Includes a shim for environments where TransformStream is not available.
 */
export function transformStream (sourceReadable, transformer) {
  let transformedReadable
  let done

  if (typeof TransformStream !== 'undefined') {
    // Chrome, Edge, Safari 14.1+
    const transform = new TransformStream(transformer)

    done = sourceReadable.pipeTo(transform.writable)
    transformedReadable = transform.readable
  } else {
    // Firefox, Safari 14 and older
    let resolveDone
    let rejectDone
    done = new Promise((resolve, reject) => {
      resolveDone = resolve
      rejectDone = reject
    })
    transformedReadable = new ReadableStream(new TransformStreamSource(sourceReadable, transformer, { resolveDone, rejectDone }))
  }

  // Ensure the caller doesn't need to catch errors
  done.catch(() => {})

  return {
    readable: transformedReadable,
    done
  }
}

class TransformStreamSource {
  constructor (readable, transformer = {}, { resolveDone, rejectDone }) {
    this.readable = readable
    this.transformer = transformer
    this.resolveDone = resolveDone
    this.rejectDone = rejectDone
    this.reader = readable.getReader()
  }

  async start (controller) {
    if (this.transformer.start) {
      try {
        await this.transformer.start(controller)
      } catch (err) {
        this.rejectDone(err)
        throw err
      }
    }
  }

  async pull (controller) {
    let progressMade = false
    const wrappedController = {
      enqueue (d) {
        progressMade = true
        controller.enqueue(d)
      },
      error (reason) {
        progressMade = true
        if (!(reason instanceof Error)) {
          reason = new Error(`stream errored; reason: ${reason}`)
        }
        controller.error(reason)
        this.reader.cancel(reason)
        this.rejectDone(reason)
      },
      terminate () {
        progressMade = true
        controller.close()
        this.reader.cancel(new Error('stream terminated'))
        this.resolveDone()
      }
    }

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!progressMade) {
      try {
        const data = await this.reader.read()
        if (data.done) {
          if (this.transformer.flush) {
            await this.transformer.flush(controller)
          }
          controller.close()
          this.resolveDone()
          return
        }
        if (this.transformer.transform) {
          await this.transformer.transform(data.value, wrappedController)
        } else {
          wrappedController.enqueue(data.value)
        }
      } catch (err) {
        this.rejectDone(err)
        this.reader.cancel(err)
        throw err
      }
    }
  }

  async cancel (reason) {
    await this.reader.cancel(reason)
    if (reason instanceof Error) {
      this.rejectDone(reason)
    } else {
      this.rejectDone(new Error(`stream cancelled; reason: ${reason}`))
    }
  }
}
