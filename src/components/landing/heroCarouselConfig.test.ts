import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HERO_SLIDE_INTERVAL_MS,
  HERO_STORY_SLIDES,
  advanceElapsedSlide,
  computeSlideProgressPct,
  getSlideDirection,
  normalizeSlideIndex,
} from './heroCarouselConfig.ts';

test('hero carousel defaults to a 2.5-second interval across 5 synchronized slides without 3D presets', () => {
  assert.equal(HERO_SLIDE_INTERVAL_MS, 2500);
  assert.equal(HERO_STORY_SLIDES.length, 5);
  assert.equal(HERO_STORY_SLIDES[0]?.tabLabel, 'Personal Health');
  assert.equal(HERO_STORY_SLIDES[1]?.tabLabel, 'Personal Baseline');
  assert.equal(HERO_STORY_SLIDES[2]?.tabLabel, 'Early Detection');
  assert.equal(HERO_STORY_SLIDES[3]?.tabLabel, 'Explainable AI');
  assert.equal(HERO_STORY_SLIDES[4]?.tabLabel, 'Caregiver Alerts');

  for (const slide of HERO_STORY_SLIDES) {
    assert.ok(slide.headline.length > 10);
    assert.ok(slide.description.length > 20);
    assert.equal('cameraPreset' in slide, false);
  }
});

test('normalizeSlideIndex wraps cleanly forward and backward across 5 slides', () => {
  assert.equal(normalizeSlideIndex(0), 0);
  assert.equal(normalizeSlideIndex(5), 0);
  assert.equal(normalizeSlideIndex(-1), 4);
  assert.equal(normalizeSlideIndex(6), 1);
});

test('advanceElapsedSlide triggers exact 2.5s transitions and loops cleanly back to slide 0', () => {
  const mid = advanceElapsedSlide(0, 2400, 50, 2500, 5);
  assert.equal(mid.advanced, false);
  assert.equal(mid.nextSlide, 0);
  assert.equal(mid.nextElapsedMs, 2450);

  const exact = advanceElapsedSlide(0, 2450, 50, 2500, 5);
  assert.equal(exact.advanced, true);
  assert.equal(exact.nextSlide, 1);
  assert.equal(exact.nextElapsedMs, 0);

  const loop = advanceElapsedSlide(4, 2460, 50, 2500, 5);
  assert.equal(loop.advanced, true);
  assert.equal(loop.nextSlide, 0);
  assert.equal(loop.nextElapsedMs, 10);
});

test('computeSlideProgressPct clamps progress cleanly between 0 and 100', () => {
  assert.equal(computeSlideProgressPct(-100, 2500), 0);
  assert.equal(computeSlideProgressPct(1250, 2500), 50);
  assert.equal(computeSlideProgressPct(2500, 2500), 100);
  assert.equal(computeSlideProgressPct(9000, 2500), 100);
});

test('getSlideDirection computes forward and backward transition vectors', () => {
  assert.equal(getSlideDirection(1, 2), 1);
  assert.equal(getSlideDirection(3, 1), -1);
  assert.equal(getSlideDirection(4, 0), -1);
});
