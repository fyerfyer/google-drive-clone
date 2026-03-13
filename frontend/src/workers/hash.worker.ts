import SparkMD5 from "spark-md5";

const SLICE_SIZE = 5 * 1024 * 1024; // 5 MB per slice

self.onmessage = async (e: MessageEvent<{ file: File }>) => {
  try {
    const { file } = e.data;
    const spark = new SparkMD5.ArrayBuffer();
    const totalSlices = Math.ceil(file.size / SLICE_SIZE);
    let currentSlice = 0;

    while (currentSlice < totalSlices) {
      const start = currentSlice * SLICE_SIZE;
      const end = Math.min(start + SLICE_SIZE, file.size);
      const blob = file.slice(start, end);
      const buffer = await blob.arrayBuffer();
      spark.append(buffer);
      currentSlice++;

      // Report progress back to main thread
      self.postMessage({ progress: currentSlice / totalSlices });
    }

    const hash = spark.end();
    self.postMessage({ hash });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Hash calculation failed";
    self.postMessage({ error: message });
  }
};
