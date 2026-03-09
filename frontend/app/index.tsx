import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import {
  Image,
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
      <StatusBar barStyle="dark-content" backgroundColor="#FFFCF6" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity
            onPress={() => router.push("/")}
            style={styles.logoContainer}
          >
            <Image
              source={require("../assets/images/logo.png")}
              style={{ width: 40, height: 40 }}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>Zonect</Text>
          </TouchableOpacity>
          <View style={styles.navLinks}>
            <TouchableOpacity
              onPress={() => scrollToSection("features")}
              style={styles.navLink}
            >
              <Text style={styles.navLinkText}>Features</Text>
            </TouchableOpacity>
            {!isDesktop && (
              <TouchableOpacity
                style={styles.getStartedButtonSmall}
                onPress={() => router.push("/resident/auth" as any)}
              >
                <Text style={styles.getStartedButtonSmallText}>Login</Text>
              </TouchableOpacity>
            )}
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
          <View
            style={[
              styles.heroContent,
              { alignItems: "center", paddingRight: 0 },
            ]}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                Society Management Made Simple
              </Text>
            </View>
            <Text style={styles.heroTitle}>
              Centralized Staff Records. {"\n"}
              <Text style={styles.heroTitleHighlight}>
                Society-Level Compliance.
              </Text>{" "}
              Zero Chaos.
            </Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: "#F1F5F9",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  alignSelf: "center",
                },
              ]}
            >
              <Ionicons name="lock-closed" size={14} color="#334155" />
              <Text style={[styles.badgeText, { color: "#334155" }]}>
                Documents stored in your Society’s own Google Drive
              </Text>
            </View>
            <Text style={styles.heroSubtitle}>
              Maintain structured, organized, and easily retrievable records of
              domestic helpers — designed for society-level governance.
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
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {}}
              >
                <Text style={styles.secondaryButtonText}>
                  Request a Discussion
                </Text>
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
                <Ionicons name="person-circle" size={40} color="#14B8A6" />
                <Ionicons
                  name="shield-checkmark"
                  size={30}
                  color="#1E7A57"
                  style={{ marginTop: 20 }}
                />
                <Ionicons name="people" size={40} color="#14B8A6" />
              </View>
            </View>
          </View>
        </View>

        {/* Ownership Section */}
        <View
          style={[
            styles.section,
            {
              backgroundColor: "#F8FAFC",
              borderTopWidth: 1,
              borderTopColor: "#E2E8F0",
            },
          ]}
        >
          <View
            style={[
              styles.heroContent,
              { alignItems: "center", paddingRight: 0 },
            ]}
          >
            <Text
              style={[
                styles.sectionTitle,
                { textAlign: "center", marginBottom: 10 },
              ]}
            >
              🔐 Society-Owned Data. Full Control.
            </Text>
            <Text
              style={[
                styles.heroSubtitle,
                { textAlign: "center", fontSize: 16, alignSelf: "center" },
              ]}
            >
              Unlike most platforms where sensitive staff documents are stored
              on third-party servers, Zonect ensures all helper documents are
              stored directly in your society’s own Google Drive.
            </Text>

            <View style={{ gap: 12, marginTop: 10, alignItems: "center" }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  width: isDesktop ? "auto" : "100%",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#14B8A6" />
                <Text
                  style={{ fontSize: 16, color: "#334155", fontWeight: "500" }}
                >
                  Society retains complete ownership
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  width: isDesktop ? "auto" : "100%",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#14B8A6" />
                <Text
                  style={{ fontSize: 16, color: "#334155", fontWeight: "500" }}
                >
                  Admin-controlled access
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  width: isDesktop ? "auto" : "100%",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#14B8A6" />
                <Text
                  style={{ fontSize: 16, color: "#334155", fontWeight: "500" }}
                >
                  No dependency on vendor data storage
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  width: isDesktop ? "auto" : "100%",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#14B8A6" />
                <Text
                  style={{ fontSize: 16, color: "#334155", fontWeight: "500" }}
                >
                  Structured indexing for quick retrieval
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.heroSubtitle,
                {
                  textAlign: "center",
                  fontSize: 16,
                  marginTop: 30,
                  fontWeight: "700",
                  color: "#0F2A3D",
                  alignSelf: "center",
                },
              ]}
            >
              Zonect provides the management interface — your society keeps the
              documents.
            </Text>
          </View>
        </View>

        {/* Features Section */}
        <View
          style={[
            styles.section,
            { borderTopWidth: 1, borderTopColor: "#E2E8F0" },
          ]}
          onLayout={handleLayout("features")}
        >
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
              icon="shield-checkmark-outline"
              title="Verified Staff Registry"
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
              icon="reader-outline"
              title="Record History & Documentation Trail"
              description="Maintain an organized history of staff records — including profile updates, document uploads, and status changes."
            />
            <FeatureCard
              styles={styles}
              icon="lock-closed-outline"
              title="Role-Based Access & Society-Owned Secure Storage"
              description="Ensure all helper data is verified and securely stored in Society-Owned Secure Storage."
            />
          </View>
        </View>

        {/* Why This Matters Section */}
        <View
          style={[
            styles.section,
            {
              backgroundColor: "#F8FAFC",
              borderTopWidth: 1,
              borderTopColor: "#E2E8F0",
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Why This Matters</Text>
            <Text style={styles.sectionSubtitle}>
              Why Structured Staff Documentation Matters?
            </Text>
          </View>

          <View style={styles.featuresGrid}>
            {[
              "Committee accountability",
              "Organized and centralized records",
              "Quick retrieval during inquiries",
              "Reduced dependency on scattered files",
              "Long-term continuity even if committee changes",
            ].map((text, idx) => (
              <View
                key={idx}
                style={[
                  styles.featureCard,
                  {
                    width: isDesktop ? "30%" : "100%",
                    padding: 20,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  },
                ]}
              >
                <Ionicons
                  name="checkmark-done-circle"
                  size={24}
                  color="#14B8A6"
                />
                <Text
                  style={{
                    fontSize: 15,
                    color: "#334155",
                    fontWeight: "600",
                    flex: 1,
                  }}
                >
                  {text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* How It Works Section */}
        <View
          style={[
            styles.howItWorksSection,
            { borderTopWidth: 1, borderTopColor: "#E2E8F0" },
          ]}
          onLayout={handleLayout("howItWorks")}
        >
          <Text style={styles.sectionTitle}>How Zonect Works</Text>
          <Text style={styles.sectionSubtitle}>
            Designed for structured documentation and quick retrieval when
            needed.
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
              Built specifically for organized housing societies in urban India.
            </Text>
            <TouchableOpacity style={styles.ctaButton} onPress={() => {}}>
              <Text style={styles.ctaButtonText}>Request a Discussion</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <View style={styles.footerLogo}>
              <View style={styles.footerLogoHeader}>
                <Image
                  source={require("../assets/images/logo.png")}
                  style={{
                    width: 40,
                    height: 40,
                  }}
                  resizeMode="contain"
                />
                <Text style={styles.footerLogoText}>Zonect</Text>
              </View>
              <Text style={styles.footerTagline}>
                Society-Level Compliance. Zero Chaos.
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
      <Ionicons name={icon} size={24} color="#14B8A6" />
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
      backgroundColor: "#FFFFFF",
    },
    header: {
      height: 70,
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      borderBottomWidth: 1,
      borderBottomColor: "#F1F5F9",
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
    navLinks: {
      flexDirection: "row",
      alignItems: "center",
      gap: 30,
    },
    navLink: {
      paddingVertical: 8,
    },
    navLinkText: {
      fontSize: 15,
      fontWeight: "600",
      color: "#0F2A3D",
    },
    logoText: {
      fontSize: 24,
      fontWeight: "900",
      color: "#14B8A6",
      marginLeft: 10,
      letterSpacing: -0.5,
    },
    getStartedButtonSmall: {
      backgroundColor: "#14B8A6",
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
    },
    getStartedButtonSmallText: {
      color: "#FFFCF6",
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
      backgroundColor: "#E6FFFA",
      paddingVertical: 6,
      paddingHorizontal: 16,
      borderRadius: 20,
      marginBottom: 20,
    },
    badgeText: {
      color: "#14B8A6",
      fontSize: 13,
      fontWeight: "700",
    },
    heroTitle: {
      fontSize: isDesktop ? 64 : 36,
      fontWeight: "900",
      color: "#0F2A3D",
      lineHeight: isDesktop ? 72 : 44,
      textAlign: "center",
      marginBottom: 10,
    },
    heroTitleHighlight: {
      color: "#14B8A6",
    },
    heroSubtitle: {
      fontSize: 18,
      color: "#334155",
      lineHeight: 28,
      textAlign: "center",
      marginBottom: 32,
      maxWidth: 600,
    },
    heroButtons: {
      flexDirection: "row",
      gap: 16,
      justifyContent: "center",
      width: "100%",
    },
    primaryButton: {
      backgroundColor: "#14B8A6",
      paddingVertical: 16,
      paddingHorizontal: 28,
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
      shadowColor: "#14B8A6",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryButtonText: {
      color: "#FFFCF6",
      fontSize: 16,
      fontWeight: "800",
    },
    secondaryButton: {
      backgroundColor: "transparent",
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#E2E8F0",
      justifyContent: "center",
    },
    secondaryButtonText: {
      color: "#0F2A3D",
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
      backgroundColor: "rgba(20, 184, 166, 0.05)",
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
      backgroundColor: "#14B8A6",
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
      color: "#0F2A3D",
      textAlign: "center",
      marginBottom: 16,
    },
    sectionSubtitle: {
      fontSize: 17,
      color: "#334155",
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
      borderRadius: 16,
      padding: 30,
      borderWidth: 1,
      borderColor: "#F1F5F9",
    },
    featureIconContainer: {
      width: 50,
      height: 50,
      backgroundColor: "#E6FFFA",
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 20,
    },
    featureTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: "#0F2A3D",
      marginBottom: 12,
    },
    featureDescription: {
      fontSize: 14,
      color: "#334155",
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
      color: "rgba(20, 184, 166, 0.05)",
      position: "absolute",
      top: -40,
    },
    stepTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: "#0F2A3D",
      marginBottom: 12,
      textAlign: "center",
    },
    stepDescription: {
      fontSize: 14,
      color: "#334155",
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: 20,
    },
    stepLine: {
      width: 80,
      height: 2,
      backgroundColor: "#E2E8F0",
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
      backgroundColor: "#14B8A6",
      borderRadius: 24,
      padding: isDesktop ? 60 : 40,
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
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    ctaButtonText: {
      color: "#14B8A6",
      fontSize: 16,
      fontWeight: "800",
    },
    footer: {
      backgroundColor: "#0F2A3D",
      paddingHorizontal: isDesktop ? 60 : 20,
      paddingVertical: 60,
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
    footerLogoHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
    },
    footerLogoText: {
      fontSize: 24,
      fontWeight: "900",
      color: "#FFFFFF",
      marginLeft: 10,
      letterSpacing: -0.5,
    },
    footerTagline: {
      fontSize: 14,
      color: "#94A3B8",
      marginTop: 8,
    },
    footerLinks: {
      flexDirection: "row",
      gap: 30,
    },
    footerLinkText: {
      fontSize: 14,
      color: "#E2E8F0",
      fontWeight: "600",
    },
    footerBottom: {
      borderTopWidth: 1,
      borderTopColor: "rgba(255, 255, 255, 0.1)",
      paddingTop: 30,
      alignItems: "center",
    },
    copyrightText: {
      fontSize: 12,
      color: "#94A3B8",
    },
  });
