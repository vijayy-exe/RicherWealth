import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHealth(): { status: string; timestamp: string; version: string } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env["npm_package_version"] ?? "0.0.1",
    };
  }
}
