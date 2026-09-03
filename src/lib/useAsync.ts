import { ref, shallowRef, watch, type Ref } from 'vue'
import { ApiError } from '@/lib/api/client'

/**
 * The one loading/error/data primitive every view uses, so that every screen gets
 * a real skeleton and a real error state rather than each page inventing its own.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  options: { immediate?: boolean; watch?: Ref<unknown>[] } = {},
) {
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** True only for the very first load, so refreshes don't flash the skeleton. */
  const settled = ref(false)

  async function run(): Promise<T | null> {
    loading.value = true
    error.value = null
    try {
      const result = await loader()
      data.value = result
      return result
    } catch (e) {
      error.value =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Something went wrong loading this view.'
      return null
    } finally {
      loading.value = false
      settled.value = true
    }
  }

  if (options.immediate !== false) void run()
  if (options.watch?.length) watch(options.watch, () => void run())

  return { data, loading, error, settled, refresh: run }
}

/** Wraps a one-shot mutation with its own pending/error state. */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function run(...args: A): Promise<R | null> {
    pending.value = true
    error.value = null
    try {
      return await action(...args)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'The action could not be completed.'
      return null
    } finally {
      pending.value = false
    }
  }

  return { pending, error, run }
}
