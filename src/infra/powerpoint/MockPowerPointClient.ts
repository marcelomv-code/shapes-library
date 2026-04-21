/**
 * In-memory mock `PowerPointClient` for unit tests. Deterministic, no
 * process spawn, no filesystem writes (unless the consumer-supplied
 * fixtures explicitly construct them).
 *
 * Each method records its calls in `this.calls` so tests can assert
 * invocation order / arguments. Default return values mirror the
 * happy-path shape of the real adapter (empty shape, slide index 1,
 * deck path echoed back). Override any method by assigning to the
 * corresponding `responses` entry before acting.
 */

import type { PowerPointClient } from "../../domain/powerpoint/PowerPointClient";
import type { ExtractionResult } from "../../domain/powerpoint/types";

interface MockCall {
  method: keyof PowerPointClient;
  args: unknown[];
}

export interface MockResponses {
  captureSelectedShape?: () => Promise<ExtractionResult> | ExtractionResult;
  copyShapeToClipboard?: (pptxPath: string) => Promise<void> | void;
  copyDeckSlideToClipboard?: (deckPath: string, slideIndex: number) => Promise<void> | void;
  insertSlide?: (deckPath: string, slideIndex: number) => Promise<void> | void;
  addSlideFromPptx?: (deckPath: string, sourcePath: string) => Promise<number> | number;
  createDeck?: (templatePath?: string) => Promise<string> | string;
}

export class MockPowerPointClient implements PowerPointClient {
  readonly calls: MockCall[] = [];
  responses: MockResponses;

  constructor(responses: MockResponses = {}) {
    this.responses = responses;
  }

  async captureSelectedShape(): Promise<ExtractionResult> {
    this.calls.push({ method: "captureSelectedShape", args: [] });
    if (this.responses.captureSelectedShape) {
      return await this.responses.captureSelectedShape();
    }
    return {
      success: true,
      shape: {
        name: "MockShape",
        type: 1,
        position: { x: 1, y: 1 },
        size: { width: 2, height: 2 },
        rotation: 0,
        fill: {},
        line: { weight: 1 },
      },
    };
  }

  async copyShapeToClipboard(pptxPath: string): Promise<void> {
    this.calls.push({ method: "copyShapeToClipboard", args: [pptxPath] });
    if (this.responses.copyShapeToClipboard) {
      await this.responses.copyShapeToClipboard(pptxPath);
    }
  }

  async copyDeckSlideToClipboard(deckPath: string, slideIndex: number): Promise<void> {
    this.calls.push({ method: "copyDeckSlideToClipboard", args: [deckPath, slideIndex] });
    if (this.responses.copyDeckSlideToClipboard) {
      await this.responses.copyDeckSlideToClipboard(deckPath, slideIndex);
    }
  }

  async insertSlide(deckPath: string, slideIndex: number): Promise<void> {
    this.calls.push({ method: "insertSlide", args: [deckPath, slideIndex] });
    if (this.responses.insertSlide) {
      await this.responses.insertSlide(deckPath, slideIndex);
    }
  }

  async addSlideFromPptx(deckPath: string, sourcePath: string): Promise<number> {
    this.calls.push({ method: "addSlideFromPptx", args: [deckPath, sourcePath] });
    if (this.responses.addSlideFromPptx) {
      return await this.responses.addSlideFromPptx(deckPath, sourcePath);
    }
    return 1;
  }

  async createDeck(templatePath?: string): Promise<string> {
    this.calls.push({ method: "createDeck", args: [templatePath] });
    if (this.responses.createDeck) {
      return await this.responses.createDeck(templatePath);
    }
    return "/tmp/mock_deck.pptx";
  }

  /** Reset recorded calls. Useful between test cases. */
  reset(): void {
    this.calls.length = 0;
  }
}
