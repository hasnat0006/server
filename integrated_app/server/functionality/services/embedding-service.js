class EmbeddingService {
  constructor() {
    this.pipelinePromise = null;
    this.pipelineFactory = null;
  }

  async getPipeline() {
    if (!this.pipelinePromise) {
      if (!this.pipelineFactory) {
        const transformers = await import('@xenova/transformers');
        this.pipelineFactory = transformers.pipeline;
      }

      this.pipelinePromise = this.pipelineFactory('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    return this.pipelinePromise;
  }

  async embedText(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    const extractor = await this.getPipeline();
    const output = await extractor(trimmed, { pooling: 'mean', normalize: true });

    // output.data is a TypedArray
    return Array.from(output.data);
  }

  async embedTexts(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    // Filter and keep track of original indices to map back
    const validTexts = [];
    const mapping = [];
    for (let i = 0; i < texts.length; i++) {
      const t = (texts[i] || '').trim();
      if (t) {
        validTexts.push(t);
        mapping.push(i);
      }
    }

    const results = new Array(texts.length).fill(null);
    if (validTexts.length === 0) return results;

    const extractor = await this.getPipeline();
    const output = await extractor(validTexts, { pooling: 'mean', normalize: true });

    const batchSize = validTexts.length;
    const dim = output.data.length / batchSize;
    for (let i = 0; i < batchSize; i++) {
      const start = i * dim;
      const end = start + dim;
      const originalIndex = mapping[i];
      results[originalIndex] = Array.from(output.data.subarray(start, end));
    }

    return results;
  }
}

module.exports = new EmbeddingService();
