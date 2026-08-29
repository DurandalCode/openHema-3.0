// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileOrLinkField } from "./file-or-link-field";
import type { TournamentFile } from "@/entities/tournament/lib/types";

const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastError: (...args: unknown[]) => toastError(...args),
}));

vi.mock("../api/requests", () => ({
  uploadTournamentFileRequest: vi.fn(),
  deleteTournamentFileRequest: vi.fn(),
}));

import { deleteTournamentFileRequest, uploadTournamentFileRequest } from "../api/requests";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

const EMPTY_FILE: TournamentFile = { url: "", name: "", size: 0 };

describe("FileOrLinkField (spec 0042, T39)", () => {
  it("renders the URL input in link mode when no file is uploaded", () => {
    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue="https://cdn.example.com/rules.pdf"
        onUrlChange={vi.fn()}
        file={EMPTY_FILE}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Ссылка на регламент");
    expect(input).toHaveAttribute("type", "url");
    expect(input).toHaveValue("https://cdn.example.com/rules.pdf");
    expect(screen.getByRole("button", { name: "Загрузить файл" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить" })).not.toBeInTheDocument();
  });

  it("calls onUrlChange when typing in link mode", () => {
    const onUrlChange = vi.fn();
    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue=""
        onUrlChange={onUrlChange}
        file={EMPTY_FILE}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Ссылка на регламент"), {
      target: { value: "https://cdn.example.com/new.pdf" },
    });
    expect(onUrlChange).toHaveBeenCalledWith("https://cdn.example.com/new.pdf");
  });

  it("shows the file name/size and a delete button when a file is uploaded", () => {
    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue=""
        onUrlChange={vi.fn()}
        file={{ url: "/api/files/r1", name: "rules.pdf", size: 2.4 * 1024 * 1024 }}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByText("rules.pdf")).toBeInTheDocument();
    expect(screen.getByText("2,4 МБ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Ссылка на регламент")).not.toBeInTheDocument();
  });

  it("rejects a file of the wrong type before calling fetch (regulations wants PDF)", async () => {
    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue=""
        onUrlChange={vi.fn()}
        file={EMPTY_FILE}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Загрузить файл: Ссылка на регламент");
    const file = new File(["hi"], "rules.docx", { type: "application/msword" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(uploadTournamentFileRequest).not.toHaveBeenCalled();
  });

  it("rejects a file over the size threshold before calling fetch", async () => {
    render(
      <FileOrLinkField
        label="URL эмблемы"
        urlValue=""
        onUrlChange={vi.fn()}
        file={EMPTY_FILE}
        kind="emblem"
        accept="image/png,image/jpeg,image/webp"
        maxBytes={5}
        showPreview
        onUploaded={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Загрузить файл: URL эмблемы");
    const big = new File([new Uint8Array(10)], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [big] } });

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(uploadTournamentFileRequest).not.toHaveBeenCalled();
  });

  it("calls onUploaded on a successful upload", async () => {
    const onUploaded = vi.fn();
    const updatedTournament = { id: "t1", regulationsFile: { url: "/api/files/r1" } };
    vi.mocked(uploadTournamentFileRequest).mockResolvedValue({
      ok: true,
      tournament: updatedTournament,
    } as never);

    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue=""
        onUrlChange={vi.fn()}
        file={EMPTY_FILE}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={onUploaded}
        onDeleted={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Загрузить файл: Ссылка на регламент");
    const file = new File(["%PDF"], "rules.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(updatedTournament));
    expect(uploadTournamentFileRequest).toHaveBeenCalledWith("regulations", file);
  });

  it("shows an error toast and does not call onUploaded when the upload fails", async () => {
    const onUploaded = vi.fn();
    vi.mocked(uploadTournamentFileRequest).mockResolvedValue({
      ok: false,
      error: "tournament: storage unavailable",
      status: 409,
    });

    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue=""
        onUrlChange={vi.fn()}
        file={EMPTY_FILE}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={onUploaded}
        onDeleted={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Загрузить файл: Ссылка на регламент");
    const file = new File(["%PDF"], "rules.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("calls onDeleted on a successful delete", async () => {
    const onDeleted = vi.fn();
    const updatedTournament = { id: "t1", regulationsFile: { url: "" } };
    vi.mocked(deleteTournamentFileRequest).mockResolvedValue({
      ok: true,
      tournament: updatedTournament,
    } as never);

    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue=""
        onUrlChange={vi.fn()}
        file={{ url: "/api/files/r1", name: "rules.pdf", size: 100 }}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(updatedTournament));
    expect(deleteTournamentFileRequest).toHaveBeenCalledWith("regulations");
  });

  it("shows an error toast and does not call onDeleted when the delete fails", async () => {
    const onDeleted = vi.fn();
    vi.mocked(deleteTournamentFileRequest).mockResolvedValue({
      ok: false,
      error: "forbidden",
      status: 403,
    });

    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue=""
        onUrlChange={vi.fn()}
        file={{ url: "/api/files/r1", name: "rules.pdf", size: 100 }}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={vi.fn()}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("renders an emblem preview thumbnail when showPreview is set", () => {
    render(
      <FileOrLinkField
        label="URL эмблемы"
        urlValue=""
        onUrlChange={vi.fn()}
        file={{ url: "/api/files/e1", name: "logo.png", size: 100 }}
        kind="emblem"
        accept="image/png,image/jpeg,image/webp"
        maxBytes={5 * 1024 * 1024}
        showPreview
        onUploaded={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "Эмблема турнира" })).toHaveAttribute(
      "src",
      "/api/files/e1",
    );
  });

  it("does not render a preview when showPreview is not set (regulations)", () => {
    render(
      <FileOrLinkField
        label="Ссылка на регламент"
        urlValue=""
        onUrlChange={vi.fn()}
        file={EMPTY_FILE}
        kind="regulations"
        accept="application/pdf"
        maxBytes={10 * 1024 * 1024}
        onUploaded={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );

    expect(screen.queryByRole("img", { name: "Эмблема турнира" })).not.toBeInTheDocument();
  });
});
