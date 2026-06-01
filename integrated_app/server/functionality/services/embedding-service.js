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
}

module.exports = new EmbeddingService();
