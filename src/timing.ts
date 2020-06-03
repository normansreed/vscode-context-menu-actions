
export const time = () => new Date().getTime();
export const elapsed = (start: number) => time() - start;