import { appId, auth, db } from "@/configs/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";

type AppState =
  | "loading"
  | "admin_setup"
  | "admin_dashboard"
  | "resident_dashboard"
  | "login"
  | "auth";

interface AuthContextType {
  user: User | null;
  appState: AppState;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appState, setAppState] = useState<AppState>("loading");
  const [isLoading, setIsLoading] = useState(true);

  const checkUserRole = async (currentUser: User | null) => {
    setIsLoading(true);
    if (currentUser) {
      try {
        // Check if this UID is registered in the public societies collection
        const societyDocRef = doc(
          db,
          `artifacts/${appId}/public/data/societies`,
          currentUser.uid,
        );

        // Try getting from server first to bypass "Offline" cache state
        let societyDoc;
        try {
          societyDoc = await getDocFromServer(societyDocRef);
        } catch (serverError) {
          console.warn("Server fetch failed, trying local getDoc...");
          societyDoc = await getDoc(societyDocRef);
        }

        if (societyDoc.exists()) {
          const data = societyDoc.data();
          // Verify if setup is actually complete
          const isSetupComplete =
            data.societyName && data.driveFolderId && data.role === "ADMIN";

          if (isSetupComplete) {
            // User is a fully registered Admin
            setAppState("admin_dashboard");
          } else {
            // User has linked drive but not completed the form
            setAppState("admin_setup");
          }
        } else {
          // Check if it's a Resident
          if (currentUser.displayName === "Resident") {
            setAppState("resident_dashboard");
          } else {
            // User is logged in but hasn't "Digitized" their society yet
            // This covers both new Email/Password sign-ups and Google Sign-Ins
            if (currentUser.isAnonymous && !currentUser.displayName) {
              setAppState("login");
            } else {
              // CHECK: Validate Gmail domain for new admin registrations
              const email = currentUser.email?.toLowerCase() || "";
              if (email && !email.endsWith("@gmail.com")) {
                // Invalid domain - sign out and stay on login
                await auth.signOut();
                setAppState("login");
              } else {
                setAppState("admin_setup");
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user state:", error);
        setAppState("login");
      }
    } else {
      setAppState("login");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      await checkUserRole(currentUser);
    });
    return unsubscribe;
  }, []);

  const refreshUser = async () => {
    await auth.currentUser?.reload();
    setUser(auth.currentUser);
    await checkUserRole(auth.currentUser);
  };

  const signOut = async () => {
    await auth.signOut();
    await AsyncStorage.removeItem("resident_session");
    setAppState("login");
  };

  return (
    <AuthContext.Provider
      value={{ user, appState, isLoading, signOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
