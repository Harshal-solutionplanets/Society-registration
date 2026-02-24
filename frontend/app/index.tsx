import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

export default function LandingPage() {
  const router = useRouter();
  const { appState } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const scrollViewRef = useRef<ScrollView>(null);
  const styles = getStyles(isDesktop);

  // States to store section positions for scrolling
  const sectionPositions = useRef<{ [key: string]: number }>({});

  const scrollToSection = (sectionId: string) => {
    const position = sectionPositions.current[sectionId];
    if (position !== undefined && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: position, animated: true });
    }
  };

  const handleLayout = (sectionId: string) => (event: any) => {
    sectionPositions.current[sectionId] = event.nativeEvent.layout.y;
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>Zonect</Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroContent}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                Society Management Made Simple
              </Text>
            </View>
            <Text style={styles.heroTitle}>
              Track & Manage{" "}
              <Text style={styles.heroTitleHighlight}>Home Assistants</Text> for
              Your Society
            </Text>
            <Text style={styles.heroSubtitle}>
              Zonect helps residential societies store, track, and manage data
              of domestic helpers — from cleaning staff to drivers — all in one
              secure platform.
            </Text>
            <View style={styles.heroButtons}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push("/resident/auth" as any)}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color="#FFF"
                  style={{ marginLeft: 8 }}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.heroImageContainer}>
            <View style={styles.illustrationCard}>
              <Ionicons
                name="business"
                size={isDesktop ? 200 : 120}
                color="#2D958E"
                style={{ opacity: 0.1 }}
              />
              <View style={styles.illustrationOverlay}>
                <View style={styles.buildingBlock}>
                  <View style={styles.window} />
                  <View style={styles.window} />
                  <View style={styles.window} />
                  <View style={styles.window} />
                </View>
                <View
                  style={[
                    styles.buildingBlock,
                    { height: 120, marginHorizontal: 10 },
                  ]}
                >
                  <View style={styles.window} />
                  <View style={styles.window} />
                  <View style={styles.window} />
                  <View style={styles.window} />
                  <View style={styles.window} />
                  <View style={styles.window} />
                </View>
                <View style={styles.buildingBlock}>
                  <View style={styles.window} />
                  <View style={styles.window} />
                  <View style={styles.window} />
                  <View style={styles.window} />
                </View>
              </View>
              <View style={styles.staffIcons}>
                <Ionicons name="person-circle" size={40} color="#2D958E" />
                <Ionicons
                  name="shield-checkmark"
                  size={30}
                  color="#059669"
                  style={{ marginTop: 20 }}
                />
                <Ionicons name="people" size={40} color="#2D958E" />
              </View>
            </View>
          </View>
        </View>

        {/* Features Section */}
        <View style={styles.section} onLayout={handleLayout("features")}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Everything Your Society Needs
            </Text>
            <Text style={styles.sectionSubtitle}>
              From admin dashboards to household-level helper management, Zonect
              covers it all.
            </Text>
          </View>

          <View style={styles.featuresGrid}>
            <FeatureCard
              styles={styles}
              icon="business-outline"
              title="Society Administration"
              description="Admins can manage households, buildings, and residents with a centralized dashboard."
            />
            <FeatureCard
              styles={styles}
              icon="person-outline"
              title="Helper Profiles"
              description="Store complete profiles of domestic helpers — name, photo, ID proof, and work schedule."
            />
            <FeatureCard
              styles={styles}
              icon="home-outline"
              title="House-wise Tracking"
              description="Each household tracks their own helpers — cleaning staff, cooks, drivers, and more."
            />
            <FeatureCard
              styles={styles}
              icon="call-outline"
              title="Contact Management"
              description="Quickly access and update contact details of all domestic helpers linked to your home."
            />
            <FeatureCard
              styles={styles}
              icon="clipboard-outline"
              title="Entry & Exit Logs"
              description="Maintain records of helper visits with timestamps for better security and accountability."
            />
            <FeatureCard
              styles={styles}
              icon="checkmark-circle-outline"
              title="Verified & Secure"
              description="Ensure all helper data is verified and securely stored with role-based access control."
            />
          </View>
        </View>

        {/* How It Works Section */}
        <View
          style={styles.howItWorksSection}
          onLayout={handleLayout("howItWorks")}
        >
          <Text style={styles.sectionTitle}>How Zonect Works</Text>
          <Text style={styles.sectionSubtitle}>
            Get your society set up in minutes with a simple 4-step process.
          </Text>

          <View style={styles.stepsContainer}>
            <StepItem
              styles={styles}
              number="01"
              title="Admin Registers Society"
              description="Society admin sets up the community, adds buildings, floors, and flat numbers."
            />
            <StepLine isDesktop={isDesktop} styles={styles} />
            <StepItem
              styles={styles}
              number="02"
              title="Residents Join"
              description="House members register and get access to manage their household data."
            />
            <StepLine isDesktop={isDesktop} styles={styles} />
            <StepItem
              styles={styles}
              number="03"
              title="Add Domestic Helpers"
              description="Each household adds helper details — name, role, contact, ID proof, and schedule."
            />
            <StepLine isDesktop={isDesktop} styles={styles} />
            <StepItem
              styles={styles}
              number="04"
              title="Track & Update"
              description="Keep records up to date, view logs, and manage helper information anytime."
            />
          </View>
        </View>

        {/* Ready to Manage CTA */}
        <View style={styles.ctaSection}>
          <View style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>Ready to Manage Your Society?</Text>
            <Text style={styles.ctaSubtitle}>
              Join hundreds of residential societies already using Zonect to
              streamline domestic helper management.
            </Text>
            <View style={{ height: 20 }} />
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <View style={styles.footerLogo}>
              <Text style={styles.logoText}>Zonect</Text>
              <Text style={styles.footerTagline}>
                Society management, simplified.
              </Text>
            </View>
            <View style={styles.footerLinks}>
              <TouchableOpacity>
                <Text style={styles.footerLinkText}>Privacy</Text>
              </TouchableOpacity>
              <TouchableOpacity>
                <Text style={styles.footerLinkText}>Terms</Text>
              </TouchableOpacity>
              <TouchableOpacity>
                <Text style={styles.footerLinkText}>zonect.in</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.footerBottom}>
            <Text style={styles.copyrightText}>
              © 2026 Zonect. All rights reserved.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const FeatureCard = ({
  icon,
  title,
  description,
  styles,
}: {
  icon: any;
  title: string;
  description: string;
  styles: any;
}) => (
  <View style={styles.featureCard}>
    <View style={styles.featureIconContainer}>
      <Ionicons name={icon} size={24} color="#2D958E" />
    </View>
    <Text style={styles.featureTitle}>{title}</Text>
    <Text style={styles.featureDescription}>{description}</Text>
  </View>
);

const StepItem = ({
  number,
  title,
  description,
  styles,
}: {
  number: string;
  title: string;
  description: string;
  styles: any;
}) => (
  <View style={styles.stepItem}>
    <Text style={styles.stepNumber}>{number}</Text>
    <Text style={styles.stepTitle}>{title}</Text>
    <Text style={styles.stepDescription}>{description}</Text>
  </View>
);

const StepLine = ({
  isDesktop,
  styles,
}: {
  isDesktop: boolean;
  styles: any;
}) => (isDesktop ? <View style={styles.stepLine} /> : null);

const getStyles = (isDesktop: boolean) =>
  StyleSheet.create({
    mainContainer: {
      flex: 1,
      backgroundColor: "#FFFAF5",
    },
    header: {
      height: 70,
      backgroundColor: "rgba(255, 250, 245, 0.9)",
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
      justifyContent: "center",
      paddingHorizontal: isDesktop ? 60 : 20,
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
    },
    headerInner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      maxWidth: 1200,
      alignSelf: "center",
      width: "100%",
    },
    logoContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    logoText: {
      fontSize: 22,
      fontWeight: "900",
      color: "#2D958E",
      letterSpacing: -0.5,
    },
    navLinks: {
      flexDirection: "row",
      gap: 30,
    },
    navLink: {
      paddingVertical: 8,
    },
    navLinkText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#4B5563",
    },
    getStartedButtonSmall: {
      backgroundColor: "#2D958E",
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
    },
    getStartedButtonSmallText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: 70,
    },
    heroSection: {
      flexDirection: isDesktop ? "row" : "column",
      paddingHorizontal: isDesktop ? 60 : 20,
      paddingVertical: isDesktop ? 100 : 40,
      maxWidth: 1200,
      alignSelf: "center",
      alignItems: "center",
      width: "100%",
    },
    heroContent: {
      flex: 1,
      paddingRight: isDesktop ? 40 : 0,
      alignItems: isDesktop ? "flex-start" : "center",
    },
    badge: {
      backgroundColor: "rgba(45, 149, 142, 0.1)",
      paddingVertical: 6,
      paddingHorizontal: 16,
      borderRadius: 20,
      marginBottom: 20,
    },
    badgeText: {
      color: "#2D958E",
      fontSize: 13,
      fontWeight: "700",
    },
    heroTitle: {
      fontSize: isDesktop ? 56 : 36,
      fontWeight: "900",
      color: "#111827",
      lineHeight: isDesktop ? 64 : 44,
      textAlign: isDesktop ? "left" : "center",
      marginBottom: 20,
    },
    heroTitleHighlight: {
      color: "#2D958E",
    },
    heroSubtitle: {
      fontSize: 18,
      color: "#4B5563",
      lineHeight: 28,
      textAlign: isDesktop ? "left" : "center",
      marginBottom: 32,
      maxWidth: 600,
    },
    heroButtons: {
      flexDirection: "row",
      gap: 16,
    },
    primaryButton: {
      backgroundColor: "#2D958E",
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      shadowColor: "#2D958E",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "800",
    },
    secondaryButton: {
      backgroundColor: "#F3F4F6",
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 12,
      justifyContent: "center",
    },
    secondaryButtonText: {
      color: "#1F2937",
      fontSize: 16,
      fontWeight: "700",
    },
    heroImageContainer: {
      flex: 1,
      marginTop: isDesktop ? 0 : 40,
      alignItems: "center",
      width: "100%",
    },
    illustrationCard: {
      width: "100%",
      maxWidth: 500,
      aspectRatio: 1.4,
      backgroundColor: "rgba(45, 149, 142, 0.05)",
      borderRadius: 30,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      overflow: "hidden",
    },
    illustrationOverlay: {
      flexDirection: "row",
      alignItems: "flex-end",
      position: "absolute",
      bottom: 0,
    },
    buildingBlock: {
      width: 60,
      height: 100,
      backgroundColor: "#2D958E",
      opacity: 0.2,
      borderRadius: 8,
      padding: 10,
      gap: 8,
    },
    window: {
      width: "100%",
      height: 10,
      backgroundColor: "#FFF",
      opacity: 0.5,
      borderRadius: 2,
    },
    staffIcons: {
      position: "absolute",
      width: "100%",
      height: "100%",
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      padding: 40,
    },
    section: {
      paddingHorizontal: isDesktop ? 60 : 20,
      paddingVertical: 80,
      backgroundColor: "transparent",
    },
    sectionHeader: {
      alignItems: "center",
      marginBottom: 60,
    },
    sectionTitle: {
      fontSize: 32,
      fontWeight: "800",
      color: "#111827",
      textAlign: "center",
      marginBottom: 16,
    },
    sectionSubtitle: {
      fontSize: 16,
      color: "#6B7280",
      textAlign: "center",
      maxWidth: 600,
    },
    featuresGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 24,
      maxWidth: 1200,
      alignSelf: "center",
    },
    featureCard: {
      width: isDesktop ? "30.5%" : "100%",
      backgroundColor: "#FFFFFF",
      borderRadius: 20,
      padding: 30,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.03,
      shadowRadius: 10,
      elevation: 2,
    },
    featureIconContainer: {
      width: 50,
      height: 50,
      backgroundColor: "rgba(45, 149, 142, 0.08)",
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 20,
    },
    featureTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: "#111827",
      marginBottom: 12,
    },
    featureDescription: {
      fontSize: 14,
      color: "#6B7280",
      lineHeight: 22,
    },
    howItWorksSection: {
      paddingHorizontal: isDesktop ? 60 : 20,
      paddingVertical: 100,
      alignItems: "center",
    },
    stepsContainer: {
      flexDirection: isDesktop ? "row" : "column",
      alignItems: "center",
      marginTop: 60,
      width: "100%",
      maxWidth: 1200,
    },
    stepItem: {
      flex: 1,
      alignItems: "center",
      marginVertical: isDesktop ? 0 : 20,
    },
    stepNumber: {
      fontSize: 64,
      fontWeight: "900",
      color: "rgba(45, 149, 142, 0.05)",
      position: "absolute",
      top: -40,
    },
    stepTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: "#111827",
      marginBottom: 12,
      textAlign: "center",
    },
    stepDescription: {
      fontSize: 14,
      color: "#6B7280",
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: 20,
    },
    stepLine: {
      width: 80,
      height: 2,
      backgroundColor: "rgba(45, 149, 142, 0.1)",
      marginHorizontal: 10,
    },
    ctaSection: {
      paddingHorizontal: isDesktop ? 60 : 20,
      paddingVertical: 80,
    },
    ctaCard: {
      maxWidth: 1000,
      alignSelf: "center",
      width: "100%",
      backgroundColor: "#2D958E",
      borderRadius: 30,
      padding: isDesktop ? 80 : 40,
      alignItems: "center",
    },
    ctaTitle: {
      fontSize: isDesktop ? 42 : 28,
      fontWeight: "900",
      color: "#FFFFFF",
      textAlign: "center",
      marginBottom: 16,
    },
    ctaSubtitle: {
      fontSize: 18,
      color: "rgba(255, 255, 255, 0.8)",
      textAlign: "center",
      marginBottom: 32,
      maxWidth: 600,
    },
    ctaButton: {
      backgroundColor: "#FFFFFF",
      paddingVertical: 18,
      paddingHorizontal: 36,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
    },
    ctaButtonText: {
      color: "#2D958E",
      fontSize: 16,
      fontWeight: "800",
    },
    footer: {
      backgroundColor: "#FFFAF5",
      paddingHorizontal: isDesktop ? 60 : 20,
      paddingVertical: 60,
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
    },
    footerTop: {
      flexDirection: isDesktop ? "row" : "column",
      justifyContent: "space-between",
      alignItems: isDesktop ? "flex-start" : "center",
      maxWidth: 1200,
      alignSelf: "center",
      width: "100%",
      marginBottom: 40,
    },
    footerLogo: {
      alignItems: isDesktop ? "flex-start" : "center",
      marginBottom: isDesktop ? 0 : 30,
    },
    footerTagline: {
      fontSize: 14,
      color: "#6B7280",
      marginTop: 8,
    },
    footerLinks: {
      flexDirection: "row",
      gap: 30,
    },
    footerLinkText: {
      fontSize: 14,
      color: "#6B7280",
      fontWeight: "600",
    },
    footerBottom: {
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
      paddingTop: 30,
      alignItems: "center",
    },
    copyrightText: {
      fontSize: 12,
      color: "#9CA3AF",
    },
  });
