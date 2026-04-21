/**
 * Global vitest setup.
 *
 * Resets the `@raycast/api` mock between every test to guarantee a
 * pristine `getPreferenceValues` / `environment.supportPath` per case.
 */
import { afterEach, beforeEach } from "vitest";
import { __raycast } from "./mocks/raycast-api";

beforeEach(() => {
  __raycast.reset();
});

afterEach(() => {
  __raycast.reset();
});
