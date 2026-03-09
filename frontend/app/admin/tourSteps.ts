import type { TourStep } from "@/hooks/useTour";

// ==================== DASHBOARD ====================
export const dashboardTourSteps: TourStep[] = [
  {
    id: "dashboard-welcome",
    title: "Welcome to Your Dashboard!",
    description:
      "This is the central hub of your society management. From here, you can configure wings, manage staff, update your profile, and much more. Let's take a quick look around! 🏢",
    icon: "home",
  },
  {
    id: "dashboard-profile",
    title: "Profile & Society Settings",
    description:
      'Click "Profile" in the top navigation to view or update your society\'s name, address, registration number, pincode, and advanced details like fire safety, insurance, and compliance info.',
    icon: "person-circle",
  },
  {
    id: "dashboard-committee",
    title: "Committee Management",
    description:
      'Use the "Committee" button to manage both society-level and wing-level committee members. You can add chairman, secretary, treasurer, and other designated roles.',
    icon: "people",
  },
  {
    id: "dashboard-staff",
    title: "Society Staff",
    description:
      'The "Staff" button lets you manage society-level employees such as watchmen, cleaners, maintenance workers, etc. You can upload their documents and track their details.',
    icon: "briefcase",
  },
  {
    id: "dashboard-drive",
    title: "Google Drive Integration",
    description:
      'If you haven\'t linked a Google Drive yet, use "Link Google Drive" to connect. All society documents, staff photos, and identity proofs are automatically organized in your Drive folders.',
    icon: "cloud-upload",
  },
  {
    id: "dashboard-stats",
    title: "Society Statistics",
    description:
      "The stats cards show your total Wings/Blocks and Total Units at a glance. These numbers update automatically as you configure your building structure.",
    icon: "stats-chart",
  },
  {
    id: "dashboard-wings",
    title: "Configure Wings",
    description:
      'Each wing card represents a building block. Click on a wing to set up its floors. Green means "Configured" and grey means "Pending". Use "+ Add Wing" to create additional wings.',
    icon: "business",
  },
  {
    id: "dashboard-credentials",
    title: "Resident Credentials",
    description:
      "After configuring wings and floors, each flat gets unique login credentials. Residents use these to access their own dashboard and manage their profile and staff members.",
    icon: "key",
  },
];

// ==================== SETUP ====================
export const setupTourSteps: TourStep[] = [
  {
    id: "setup-overview",
    title: "Society Profile",
    description:
      "This is where you manage all your society details. There are two sections — Basic and Advance. Let's walk through what each contains.",
    icon: "settings",
  },
  {
    id: "setup-basic",
    title: "Basic Information",
    description:
      "The Basic tab contains essential details: Society Name, Registration Number, Address, Google Maps link, Pincode, Wings count, and Admin details. Fields marked with * are mandatory.",
    icon: "document-text",
  },
  {
    id: "setup-registration",
    title: "Registration Number",
    description:
      "Your society's Registration Number must be unique across the system. It is auto-capitalized and validated for uniqueness when you save.",
    icon: "shield-checkmark",
  },
  {
    id: "setup-advance",
    title: "Advance Details",
    description:
      "Switch to the Advance tab for detailed questionnaires covering Fire Safety, Statutory Compliances, Machinery & Lifts, Insurance, Waste Management, Water & Hygiene, Pest Control, Security, and more.",
    icon: "clipboard",
  },
  {
    id: "setup-drive-rename",
    title: "Drive Folder Sync",
    description:
      "When you update the society name, the Google Drive root folder is automatically renamed to match (e.g., 'BLUE_RIDGE_SOCIETY-ZONECT'). This keeps your cloud storage organized.",
    icon: "folder",
  },
  {
    id: "setup-save",
    title: "Save Your Changes",
    description:
      'Click "Update Profile" to save all changes. The system validates all fields before saving and shows clear error messages for any issues.',
    icon: "checkmark-circle",
  },
];

// ==================== WING SETUP ====================
export const wingSetupTourSteps: TourStep[] = [
  {
    id: "wing-overview",
    title: "Wing Configuration",
    description:
      "Here you define the structure of a building wing — its name, number of floors, and flats per floor. This structure creates the resident units and credentials.",
    icon: "business",
  },
  {
    id: "wing-name",
    title: "Wing Name",
    description:
      'Enter or change the wing name (e.g., "Wing A", "Tower B"). Renaming a wing automatically updates all associated data in Firestore and renames the Drive folder.',
    icon: "create",
  },
  {
    id: "wing-floors",
    title: "Total Floors & Generate",
    description:
      'Enter the number of floors and click "Generate" to create the building structure. Once generated, use "Add Floor" to append more. Floor count is locked after generation — use the delete and add buttons.',
    icon: "layers",
  },
  {
    id: "wing-building",
    title: "Building Visualization",
    description:
      "The building diagram shows each floor as a block. Green blocks are configured (flats assigned), grey blocks need attention. Click any floor block to set the number of flats.",
    icon: "grid",
  },
  {
    id: "wing-floor-actions",
    title: "Floor Actions",
    description:
      "Each floor has: ↑↓ arrows to reorder, a click area to set flat count, → arrow to view floor details (only after saving), and a 🗑️ delete button.",
    icon: "options",
  },
  {
    id: "wing-save",
    title: "Save Wing Structure",
    description:
      'After configuring all floors, click "Save Wing Structure". This creates resident unit records, generates credentials, and sets up Drive folders for each floor.',
    icon: "save",
  },
  {
    id: "wing-report",
    title: "Download Wing Report",
    description:
      "Once saved, you can download a detailed wing report as a word file. It includes all unit data, credentials, and configuration — useful for records and sharing with residents.",
    icon: "download",
  },
];

// ==================== FLOOR ====================
export const floorTourSteps: TourStep[] = [
  {
    id: "floor-overview",
    title: "Floor & Unit Management",
    description:
      "This page shows all units on a specific floor. You can view resident details, manage credentials, and navigate into individual unit details.",
    icon: "home",
  },
  {
    id: "floor-units",
    title: "Unit Cards",
    description:
      "Each card represents a flat/unit. It shows the unit name, resident name, occupancy status, and counts for family members and staff. Click a card to see full details.",
    icon: "card",
  },
  {
    id: "floor-credentials",
    title: "Resident Credentials",
    description:
      "Each unit has a unique Username and Password pre-generated by the system. Residents use these to log into the Resident Portal and manage their own data.",
    icon: "key",
  },
  {
    id: "floor-status",
    title: "Occupancy Status",
    description:
      'Units can be "Occupied" (resident registered) or "Vacant". The status updates automatically when a resident fills the registration form using their credentials.',
    icon: "checkmark-done",
  },
  {
    id: "floor-navigation",
    title: "View Unit Details",
    description:
      "Click any unit card to navigate to the Unit Details page where you can see full resident information, staff members, audit trail, and generate individual reports.",
    icon: "arrow-forward-circle",
  },
];

// ==================== UNIT ====================
export const unitTourSteps: TourStep[] = [
  {
    id: "unit-overview",
    title: "Unit Details",
    description:
      "This page provides a comprehensive view of a specific flat/unit — resident profile, family details, vehicle info, staff members, and complete audit history.",
    icon: "home",
  },
  {
    id: "unit-resident",
    title: "Resident Information",
    description:
      "View the primary resident's name, age, gender, blood group, mobile number, profession, and ownership status (Self-Owned or Rental).",
    icon: "person",
  },
  {
    id: "unit-family",
    title: "Family & Vehicles",
    description:
      "See the number of family members and their details (name, age, contact, relation, blood group). Vehicle information is also displayed here.",
    icon: "people",
  },
  {
    id: "unit-staff",
    title: "Staff Members",
    description:
      "View all staff linked to this unit — maids, drivers, cooks, etc. Each staff member shows their photo, documents, and linking status (shared across units).",
    icon: "briefcase",
  },
  {
    id: "unit-audit",
    title: "Audit Trail",
    description:
      'Expand the "Audit Trail" section to see a chronological log of all changes made to staff profiles — who changed what, when, and the before/after values.',
    icon: "time",
  },
];

// ==================== SOCIETY STAFF ====================
export const societyStaffTourSteps: TourStep[] = [
  {
    id: "sstaff-overview",
    title: "Society Staff Management",
    description:
      "Manage your society's employed staff here — watchmen, cleaners, gardeners, electricians, etc. You can add their details and upload documentation.",
    icon: "construct",
  },
  {
    id: "sstaff-form",
    title: "Add / Edit Staff",
    description:
      "Fill in the staff member's name, position, phone, email, and shift type (Day/Night/General). You can also upload their Photo, ID Card, and Address Proof.",
    icon: "person-add",
  },
  {
    id: "sstaff-documents",
    title: "Document Uploads",
    description:
      "Staff documents (Photo, ID Card, Address Proof) are uploaded directly to Google Drive. Each staff member gets their own folder for organized storage.",
    icon: "document-attach",
  },
  {
    id: "sstaff-list",
    title: "Staff Directory",
    description:
      "The staff list below shows all registered society employees. You can click on any entry to edit details, update documents, or remove the staff member.",
    icon: "list",
  },
];

// ==================== COMMITTEE MEMBERS ====================
export const committeeTourSteps: TourStep[] = [
  {
    id: "committee-overview",
    title: "Committee Members",
    description:
      "Manage your society's governing committee. Toggle between Society-Level and Wing-Level committees to maintain records of all committee members.",
    icon: "people-circle",
  },
  {
    id: "committee-society",
    title: "Society Committee",
    description:
      "The Society Committee tab manages top-level positions like Chairman, Secretary, Treasurer, and other society-wide designations.",
    icon: "ribbon",
  },
  {
    id: "committee-wing",
    title: "Wing Committee",
    description:
      "Switch to Wing Committee to manage wing-specific representatives. Select a wing from the dropdown to view or add members for that particular wing.",
    icon: "git-branch",
  },
  {
    id: "committee-add",
    title: "Adding Members",
    description:
      "Click 'Add Member' to register a new committee member. Fill in their name, post/designation, phone, and email. All entries are saved instantly.",
    icon: "add-circle",
  },
];
