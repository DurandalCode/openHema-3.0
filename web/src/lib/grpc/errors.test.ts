import { describe, it, expect } from "vitest";
import { Code, ConnectError } from "@connectrpc/connect";
import { errorResponse } from "@/lib/grpc/errors";

describe("errorResponse", () => {
  it("maps CodeUnauthenticated to 401", () => {
    const err = new ConnectError("bad credentials", Code.Unauthenticated);
    const res = errorResponse(err);

    expect(res.status).toBe(401);
  });

  it("maps CodeAlreadyExists to 409", () => {
    const err = new ConnectError("user exists", Code.AlreadyExists);
    const res = errorResponse(err);

    expect(res.status).toBe(409);
  });

  it("maps CodeInvalidArgument to 400", () => {
    const err = new ConnectError("bad input", Code.InvalidArgument);
    const res = errorResponse(err);

    expect(res.status).toBe(400);
  });

  it("maps CodeNotFound to 404", () => {
    const err = new ConnectError("missing", Code.NotFound);
    const res = errorResponse(err);

    expect(res.status).toBe(404);
  });

  it("maps CodeInternal to 500", () => {
    const err = new ConnectError("boom", Code.Internal);
    const res = errorResponse(err);

    expect(res.status).toBe(500);
  });

  it("maps unknown code to 500", () => {
    const err = new ConnectError("??", Code.Unknown);
    const res = errorResponse(err);

    expect(res.status).toBe(500);
  });

  it("returns 500 for non-ConnectError", () => {
    const res = errorResponse(new Error("random"));

    expect(res.status).toBe(500);
  });

  it("includes error message in JSON body", async () => {
    const err = new ConnectError("user exists", Code.AlreadyExists);
    const res = errorResponse(err);
    const body = await res.json();

    expect(body.error).toBe("user exists");
  });

  it("returns generic message for non-ConnectError", async () => {
    const res = errorResponse(new Error("random"));
    const body = await res.json();

    expect(body.error).toBe("internal error");
  });
});
