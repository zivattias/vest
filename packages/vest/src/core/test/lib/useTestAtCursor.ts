import {
  isEmpty,
  isNotEmpty,
  isNullish,
  nestedArray,
  defaultTo,
  deferThrow,
} from 'vest-utils';

import { useCurrentPath, useCursor } from '../../isolate/isolateHooks';

import VestTest from 'VestTest';
import { VestTests } from 'createStateRef';
import isSameProfileTest from 'isSameProfileTest';
import { shouldAllowReorder } from 'isolate';
import { usePrevTestByKey, useRetainTestKey } from 'key';
import { useTestObjects, useSetTests } from 'stateHooks';

/**
 * This module serves as the "collision detection" mechanism for Vest.
 * It is used to ensure that tests are not called in a different order than
 * they were called in the previous run.
 * If they are, it will throw a deferred error unless explicitly allowed.
 *
 * For now it seems pretty safe, and it covers most common use cases, but it can
 * be improved in the future both in terms of performance and scenarios it covers.
 */

// eslint-disable-next-line max-statements, max-lines-per-function
export function useTestAtCursor(newTestObject: VestTest): VestTest {
  const [testObjects] = useTestObjects();

  const prevTests = testObjects.prev;

  if (isEmpty(prevTests)) {
    useSetTestAtCursor(newTestObject);
    return newTestObject;
  }

  let prevTest: VestTests | VestTest | null = useGetTestAtCursor(prevTests);

  if (!isNullish(newTestObject.key)) {
    const nextTest = handleKeyTest(newTestObject.key, newTestObject);
    useSetTestAtCursor(nextTest);
    return nextTest;
  }

  if (testReorderDetected(prevTest, newTestObject)) {
    throwTestOrderError(prevTest, newTestObject);

    removeAllNextTestsInIsolate();

    // Need to see if this has any effect at all.
    prevTest = null;
  }
  const nextTest = defaultTo(prevTest, newTestObject) as VestTest;
  useSetTestAtCursor(nextTest);
  return nextTest;
}

function removeAllNextTestsInIsolate() {
  const cursorAt = useCursor().current();

  // We actually don't mind mutating the state directly (as can be seen above). There is no harm in it
  // since we're only touching the "prev" state. The reason we still use the setter function is
  // to prevent future headaches if we ever do need to rely on prev-state immutability.

  useSetTests(current => {
    current.splice(cursorAt);
    return current;
  });
}

export function useSetTestAtCursor(testObject: VestTest): void {
  const cursorPath = useCurrentPath();

  useSetTests(tests =>
    nestedArray.setValueAtPath(tests, cursorPath, testObject)
  );
}

function useGetTestAtCursor(tests: VestTests): VestTest {
  const cursorPath = useCurrentPath();

  return nestedArray.valueAtPath(tests, cursorPath) as VestTest;
}

function testReorderDetected(prevTest: VestTest, newTest: VestTest): boolean {
  return isNotEmpty(prevTest) && !isSameProfileTest(prevTest, newTest);
}

function throwTestOrderError(
  prevTest: VestTest,
  newTestObject: VestTest
): void {
  if (shouldAllowReorder()) {
    return;
  }

  deferThrow(`Vest Critical Error: Tests called in different order than previous run.
    expected: ${prevTest.fieldName}
    received: ${newTestObject.fieldName}
    This can happen on one of two reasons:
    1. You're using if/else statements to conditionally select tests. Instead, use "skipWhen".
    2. You are iterating over a list of tests, and their order changed. Use "each" and a custom key prop so that Vest retains their state.`);
}

function handleKeyTest(key: string, newTestObject: VestTest): VestTest {
  const prevTestByKey = usePrevTestByKey(key);

  let nextTest = newTestObject;

  if (prevTestByKey) {
    nextTest = prevTestByKey;
  }

  useRetainTestKey(key, nextTest);

  return nextTest;
}
