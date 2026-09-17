import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Страж ADR 0023 (спека 0050).
 *
 * Образ кодгена (`deploy/codegen.Dockerfile`) ставит protoc-gen-es по версии,
 * записанной здесь, — своего списка версий у него нет. Поэтому манифест обязан
 * задавать её точно и в паре с runtime-библиотекой: генератор и рантайм
 * connect-es должны быть одной версии, иначе сгенерированный код и
 * `@bufbuild/protobuf` расходятся молча (именно это и произошло с remote-
 * плагинами: код генерировался 2.15.0 при рантайме 2.12.1).
 */
describe("версии кодгена в package.json", () => {
  const pkg = JSON.parse(
    readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
  ) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  const runtime = pkg.dependencies["@bufbuild/protobuf"];
  const generator = pkg.devDependencies["@bufbuild/protoc-gen-es"];

  const exact = /^\d+\.\d+\.\d+$/;

  it("генератор protoc-gen-es объявлен в devDependencies", () => {
    expect(generator).toBeDefined();
  });

  it("версия генератора точная — без ^ и ~", () => {
    expect(generator).toMatch(exact);
  });

  it("версия runtime @bufbuild/protobuf точная — без ^ и ~", () => {
    expect(runtime).toMatch(exact);
  });

  it("версия генератора совпадает с версией runtime", () => {
    expect(generator).toBe(runtime);
  });
});
