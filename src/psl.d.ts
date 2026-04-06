declare module 'psl' {
  export function parse(domain: string): {
    domain: string | null;
    subdomain: string | null;
    listed: boolean;
    error?: string;
  };
  export function isValid(domain: string): boolean;
}
