import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
    Animated,
    Dimensions,
    Easing,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import type { TourStep } from "@/hooks/useTour";

interface AppTourProps {
  isActive: boolean;
  step: TourStep | null;
  stepNumber: number;
  totalSteps: number;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

export default function AppTour({
  isActive,
  step,
  stepNumber,
  totalSteps,
  isFirst,
  isLast,
  onNext,
  onPrev,
  onSkip,
  onFinish,
}: AppTourProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive && step) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();

      // Pulse the icon
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ]),
      ).start();
    }
  }, [isActive, step?.id]);

  if (!isActive || !step) return null;

  const iconName = step.icon || "information-circle";
  const { width: screenWidth } = Dimensions.get("window");
  const isCompact = screenWidth < 500;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={styles.backdropTouch}
        activeOpacity={1}
        onPress={onSkip}
      />
      <Animated.View
        style={[
          styles.card,
          isCompact && styles.cardCompact,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i < stepNumber && styles.progressDotActive,
                i === stepNumber - 1 && styles.progressDotCurrent,
              ]}
            />
          ))}
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Animated.View
            style={[styles.iconCircle, { transform: [{ scale: pulseAnim }] }]}
          >
            <Ionicons name={iconName as any} size={28} color="#14B8A6" />
          </Animated.View>
          <View style={styles.headerText}>
            <Text style={styles.stepCounter}>
              Step {stepNumber} of {totalSteps}
            </Text>
            <Text style={styles.title}>{step.title}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onSkip}>
            <Ionicons name="close" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Description */}
        <Text style={styles.description}>{step.description}</Text>

        {/* Navigation */}
        <View style={styles.navigation}>
          <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
            <Text style={styles.skipBtnText}>Skip Tour</Text>
          </TouchableOpacity>

          <View style={styles.navActions}>
            {!isFirst && (
              <TouchableOpacity style={styles.prevBtn} onPress={onPrev}>
                <Ionicons name="chevron-back" size={18} color="#64748B" />
                <Text style={styles.prevBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, isLast && styles.finishBtn]}
              onPress={isLast ? onFinish : onNext}
            >
              <Text
                style={[styles.nextBtnText, isLast && styles.finishBtnText]}
              >
                {isLast ? "Got it!" : "Next"}
              </Text>
              {!isLast && (
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 42, 61, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99999,
    elevation: 99999,
  },
  backdropTouch: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    maxWidth: 480,
    width: "90%",
    shadowColor: "#0F2A3D",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 24,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
  },
  cardCompact: {
    padding: 18,
    marginHorizontal: 16,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
  },
  progressDotActive: {
    backgroundColor: "#99F6E4",
  },
  progressDotCurrent: {
    backgroundColor: "#14B8A6",
    width: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F0FDFA",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#99F6E4",
    marginRight: 14,
  },
  headerText: {
    flex: 1,
  },
  stepCounter: {
    fontSize: 11,
    fontWeight: "700",
    color: "#14B8A6",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F2A3D",
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    marginLeft: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: "#475569",
    marginBottom: 20,
    paddingLeft: 2,
  },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 16,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipBtnText: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "600",
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  prevBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    gap: 4,
  },
  prevBtnText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#14B8A6",
    gap: 4,
    shadowColor: "#14B8A6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextBtnText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  finishBtn: {
    backgroundColor: "#0F2A3D",
    shadowColor: "#0F2A3D",
  },
  finishBtnText: {
    color: "#FFFFFF",
  },
});
