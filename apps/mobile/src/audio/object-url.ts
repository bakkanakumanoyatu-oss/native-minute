export type ObjectUrlDependencies = Readonly<{
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}>;

const browserObjectUrlDependencies: ObjectUrlDependencies = {
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url)
};

export class AudioObjectUrl {
  private readonly dependencies: ObjectUrlDependencies;
  private current: string | null = null;

  constructor(dependencies: ObjectUrlDependencies = browserObjectUrlDependencies) {
    this.dependencies = dependencies;
  }

  get value() {
    return this.current;
  }

  replace(blob: Blob) {
    const next = this.dependencies.createObjectURL(blob);
    this.clear();
    this.current = next;
    return next;
  }

  clear() {
    if (this.current) {
      this.dependencies.revokeObjectURL(this.current);
      this.current = null;
    }
  }
}
