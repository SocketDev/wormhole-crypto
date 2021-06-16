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
    let doneCb = null

    done = new Promise((resolve, reject) => {
      doneCb = (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      }
    })
    transformedReadable = new ReadableStream(new TransformStreamSource(sourceReadable, transformer, doneCb))
  }

  // Ensure the caller doesn't need to catch errors
  done.catch(() => {})

  return {
    readable: transformedReadable,
    done
  }
}

class TransformStreamSource {
  constructor (readable, transformer, doneCb) {
    this.readable = readable
    this.transformer = transformer
    this.doneCb = doneCb
    this.reader = readable.getReader()
  }

  async start (controller) {
    if (this.transformer?.start) {
      try {
        return await this.transformer.start(controller)
      } catch (err) {
        this.doneCb(err)
        throw err
      }
    }
  }

  async pull (controller) {
    let enqueued = false
    const wrappedController = {
      enqueue (d) {
        enqueued = true
        controller.enqueue(d)
      }
    }

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!enqueued) {
      try {
        const data = await this.reader.read()
        if (data.done) {
          if (this.transformer?.flush) {
            await this.transformer.flush(controller)
          }
          controller.close()
          this.doneCb(null)
          return
        }
        if (this.transformer?.transform) {
          await this.transformer.transform(data.value, wrappedController)
        } else {
          wrappedController.enqueue(data.value)
        }
      } catch (err) {
        this.doneCb(err)
        throw err
      }
    }
  }

  async cancel (reason) {
    await this.reader.cancel(reason)
    if (reason instanceof Error) {
      this.doneCb(reason)
    } else {
      this.doneCb(new Error(`stream cancelled; reason: ${reason}`))
    }
    return reason
  }
}
