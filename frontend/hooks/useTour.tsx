import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export interface TourStep {
  /** Unique key for this step */
  id: string;
  /** Title displayed at the top of the tooltip */
  title: string;
  /** Descriptive text explaining the UI element */
  description: string;
  /** Optional icon name (Ionicons) */
  icon?: string;
}

interface UseTourOptions {
  /** Unique identifier per page, used as AsyncStorage key */
  tourId: string;
  /** Ordered list of steps */
  steps: TourStep[];
  /** Delay before showing (ms) — lets page render first */
  delay?: number;
}

export function useTour({ tourId, steps, delay = 800 }: UseTourOptions) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [hasSeenTour, setHasSeenTour] = useState(true); // default true to avoid flash
  const [isReady, setIsReady] = useState(false);

  const storageKey = `tour_seen_${tourId}`;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const checkTourStatus = async () => {
      try {
        const seen = await AsyncStorage.getItem(storageKey);
        if (seen !== "true") {
          setHasSeenTour(false);
          // Auto-start after delay
          timer = setTimeout(() => {
            setCurrentStep(0);
            setIsReady(true);
          }, delay);
        } else {
          setHasSeenTour(true);
          setIsReady(true);
        }
      } catch {
        setIsReady(true);
      }
    };
    checkTourStatus();
    return () => clearTimeout(timer);
  }, [tourId]);

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev < steps.length - 1) return prev + 1;
      return prev;
    });
  }, [steps.length]);

  const prev = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const skip = useCallback(async () => {
    setCurrentStep(-1);
    setHasSeenTour(true);
    try {
      await AsyncStorage.setItem(storageKey, "true");
    } catch {}
  }, [storageKey]);

  const finish = useCallback(async () => {
    setCurrentStep(-1);
    setHasSeenTour(true);
    try {
      await AsyncStorage.setItem(storageKey, "true");
    } catch {}
  }, [storageKey]);

  const restart = useCallback(() => {
    setCurrentStep(0);
    setHasSeenTour(false);
  }, []);

  const isActive =
    currentStep >= 0 && currentStep < steps.length && !hasSeenTour;
  const activeStep = isActive ? steps[currentStep] : null;
  const stepNumber = currentStep + 1;
  const totalSteps = steps.length;
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return {
    isActive,
    activeStep,
    stepNumber,
    totalSteps,
    isFirst,
    isLast,
    next,
    prev,
    skip,
    finish,
    restart,
    hasSeenTour,
    isReady,
  };
}
