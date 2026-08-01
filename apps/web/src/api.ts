export class ApiClient {
  constructor(private base = "/api", private token = sessionStorage.getItem("adminToken") ?? "") {}
  setToken(token: string) { this.token = token; sessionStorage.setItem("adminToken", token); }
  async get<T>(path: string): Promise<T> { const response = await fetch(this.base + path, { headers: { Authorization: `Bearer ${this.token}` } }); if (!response.ok) throw new Error(await response.text()); return response.json(); }
  async send<T>(path: string, method: string, body?: unknown): Promise<T> { const response = await fetch(this.base + path, { method, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); if (!response.ok) throw new Error(await response.text()); return response.json(); }
}
export const api = new ApiClient();
