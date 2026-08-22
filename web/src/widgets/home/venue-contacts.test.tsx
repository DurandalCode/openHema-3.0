// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VenueContacts } from "./venue-contacts";
import type { ContactJson } from "@/entities/tournament/lib/types";

describe("widgets/home VenueContacts (spec 0034, FR-10/FR-22)", () => {
  afterEach(cleanup);

  it("renders nothing when there are no contacts", () => {
    const { container } = render(<VenueContacts contacts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when all contacts have an empty value", () => {
    const contacts: ContactJson[] = [{ id: "c1", type: "CONTACT_TYPE_EMAIL", value: "" }];
    const { container } = render(<VenueContacts contacts={contacts} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders filled contacts with labels and hrefs", () => {
    const contacts: ContactJson[] = [
      { id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org" },
      { id: "c2", type: "CONTACT_TYPE_EMAIL", value: "org@test" },
    ];
    render(<VenueContacts contacts={contacts} />);

    const tg = screen.getByRole("link", { name: "Telegram: @org" });
    expect(tg).toHaveAttribute("href", "https://t.me/org");
    const email = screen.getByRole("link", { name: "Email: org@test" });
    expect(email).toHaveAttribute("href", "mailto:org@test");
  });

  it("uses the default title when none is passed, and a custom one when given", () => {
    const contacts: ContactJson[] = [{ id: "c1", type: "CONTACT_TYPE_WEBSITE", value: "https://x.test" }];
    const { rerender } = render(<VenueContacts contacts={contacts} />);
    expect(screen.getByText("Контакты организаторов")).toBeInTheDocument();

    rerender(<VenueContacts contacts={contacts} title="Зрителю" />);
    expect(screen.getByText("Зрителю")).toBeInTheDocument();
  });
});
