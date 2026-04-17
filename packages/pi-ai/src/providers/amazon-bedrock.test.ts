/**
 * TDD Red Phase — Bug #4392 / Pre-existing Bug #4352
 *
 * `supportsAdaptiveThinking()` in amazon-bedrock.ts is missing opus-4-7,
 * sonnet-4-7, and haiku-4-5. These tests FAIL until the bug is fixed.
 *
 * Related: #4392 (opus-4-7 adaptive thinking not recognised on Bedrock)
 *          #4352 (pre-existing: only opus-4-6 / sonnet-4-6 whitelisted)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    supportsAdaptiveThinking,
    mapThinkingLevelToEffort,
    buildAdditionalModelRequestFields,
    type BedrockOptions,
} from "./amazon-bedrock.js";

import type { Model } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(id: string): Model<"bedrock-converse-stream"> {
    return {
        id,
        name: id,
        api: "bedrock-converse-stream",
        provider: "amazon-bedrock" as any,
        baseUrl: "",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 32000,
    };
}

// ---------------------------------------------------------------------------
// supportsAdaptiveThinking — RED tests (#4392 / #4352)
// ---------------------------------------------------------------------------

describe("supportsAdaptiveThinking — Bug #4392 / #4352: missing models", () => {
    // These two already pass (regression guard):
    it("returns true for opus-4-6 (hyphen, Bedrock ARN style)", () => {
        assert.ok(supportsAdaptiveThinking("anthropic.claude-opus-4-6-20250514-v1:0"));
    });

    it("returns true for sonnet-4-6 (hyphen)", () => {
        assert.ok(supportsAdaptiveThinking("anthropic.claude-sonnet-4-6-20250514-v1:0"));
    });

    // --- RED: the following FAIL because opus-4-7 / sonnet-4-7 / haiku-4-5 are missing ---

    it("[#4392] returns true for opus-4-7 (hyphen, Bedrock ARN style)", () => {
        // FAILS: supportsAdaptiveThinking does not include 'opus-4-7'
        assert.ok(
            supportsAdaptiveThinking("anthropic.claude-opus-4-7-20250514-v1:0"),
            "opus-4-7 should support adaptive thinking (bug #4392)",
        );
    });

    it("[#4392] returns true for opus-4-7 (dot separator)", () => {
        // FAILS: supportsAdaptiveThinking does not include 'opus-4.7'
        assert.ok(
            supportsAdaptiveThinking("anthropic.claude-opus-4.7-20250514-v1:0"),
            "opus-4.7 (dot) should support adaptive thinking (bug #4392)",
        );
    });

    it("[#4352] returns true for sonnet-4-7 (hyphen)", () => {
        // FAILS: supportsAdaptiveThinking does not include 'sonnet-4-7'
        assert.ok(
            supportsAdaptiveThinking("anthropic.claude-sonnet-4-7-20250514-v1:0"),
            "sonnet-4-7 should support adaptive thinking (bug #4352)",
        );
    });

    it("[#4352] returns true for haiku-4-5 (hyphen)", () => {
        // FAILS: supportsAdaptiveThinking does not include 'haiku-4-5'
        assert.ok(
            supportsAdaptiveThinking("anthropic.claude-haiku-4-5-20250514-v1:0"),
            "haiku-4-5 should support adaptive thinking (bug #4352)",
        );
    });
});

// ---------------------------------------------------------------------------
// buildAdditionalModelRequestFields — adaptive thinking output for opus-4-7
// Tests go through the public API surface to validate end-to-end behaviour.
// ---------------------------------------------------------------------------

describe("buildAdditionalModelRequestFields — Bug #4392: opus-4-7 must use adaptive thinking", () => {
    const options: BedrockOptions = { reasoning: "high" };

    it("[#4392] opus-4-7 Bedrock ARN → thinking.type === 'adaptive' (not budget_tokens)", () => {
        const model = makeModel("anthropic.claude-opus-4-7-20250514-v1:0");
        const fields = buildAdditionalModelRequestFields(model, options);
        // FAILS: because supportsAdaptiveThinking returns false for opus-4-7,
        // the function returns { thinking: { type: "enabled", budget_tokens: ... } }
        assert.equal(
            fields?.thinking?.type,
            "adaptive",
            "opus-4-7 should produce thinking.type='adaptive', not budget_tokens",
        );
    });

    it("[#4392] opus-4-7 dot separator → thinking.type === 'adaptive'", () => {
        const model = makeModel("anthropic.claude-opus-4.7-20250514-v1:0");
        const fields = buildAdditionalModelRequestFields(model, options);
        assert.equal(
            fields?.thinking?.type,
            "adaptive",
            "opus-4.7 (dot) should produce thinking.type='adaptive'",
        );
    });

    it("[#4352] sonnet-4-7 → thinking.type === 'adaptive'", () => {
        const model = makeModel("anthropic.claude-sonnet-4-7-20250514-v1:0");
        const fields = buildAdditionalModelRequestFields(model, options);
        assert.equal(
            fields?.thinking?.type,
            "adaptive",
            "sonnet-4-7 should produce thinking.type='adaptive'",
        );
    });

    it("[#4352] haiku-4-5 → thinking.type === 'adaptive'", () => {
        const model = makeModel("anthropic.claude-haiku-4-5-20250514-v1:0");
        const fields = buildAdditionalModelRequestFields(model, options);
        assert.equal(
            fields?.thinking?.type,
            "adaptive",
            "haiku-4-5 should produce thinking.type='adaptive'",
        );
    });
});

// ---------------------------------------------------------------------------
// mapThinkingLevelToEffort — RED test for xhigh on opus-4-7
// The Bedrock version returns "max" (dead code path at line 411), whereas
// the correct value is "xhigh" (as implemented in anthropic-shared.ts).
// ---------------------------------------------------------------------------

describe("mapThinkingLevelToEffort — Bug #4392: opus-4-7 xhigh should return 'xhigh' not 'max'", () => {
    it("[#4392] maps xhigh → 'xhigh' for opus-4-7 (native xhigh support)", () => {
        // FAILS: current code returns "max" for opus-4-7 at line 411,
        // and in any case this code path is unreachable because
        // supportsAdaptiveThinking returns false for opus-4-7.
        // After the fix, supportsAdaptiveThinking will return true AND
        // mapThinkingLevelToEffort must return "xhigh" (not "max").
        const result = mapThinkingLevelToEffort("xhigh", "anthropic.claude-opus-4-7-20250514-v1:0");
        assert.equal(
            result,
            "xhigh",
            "opus-4-7 supports native xhigh effort — must not be clamped to 'max'",
        );
    });

    it("[#4392] maps xhigh → 'max' for opus-4-6 (no native xhigh, clamped)", () => {
        // This already passes — regression guard.
        const result = mapThinkingLevelToEffort("xhigh", "anthropic.claude-opus-4-6-20250514-v1:0");
        assert.equal(result, "max");
    });

    it("maps high → 'high' for opus-4-7 (not affected by bug)", () => {
        const result = mapThinkingLevelToEffort("high", "anthropic.claude-opus-4-7-20250514-v1:0");
        assert.equal(result, "high");
    });
});
