import streamlit as st
import google.generativeai as genai
import os
from PIL import Image # Import Pillow for image handling
import io # To handle image bytes

# --- Configuration ---
PAGE_TITLE = "App Deeplink & Image Helper"
LOGO_PATH = "logo.png" # Make sure logo.png is in the same folder

DEEPLINK_INSTRUCTIONS = """


🎯 1. Mission (one sentence)
Help the marketing & CRM team create fully-tested deep-link assets—Adjust links, QR codes, and push-notification payloads—without needing a developer.

👥 2. Target users
• Non-technical marketers  
• Assume zero coding knowledge  
• Use German or plain English, whichever the user starts with

🛠️ 3. What you can deliver (one of these, don't offer push notification-related stuff if user asks for link only)
Use-case                    │ Return to the user
────────────────────────────┼──────────────────────────────────────────────────────────────────────────
Adjust custom link setup     │ • Deep-link path (gesund://…)  
                             │ • Recommended channel / campaign / adgroup / creative values  (ask if user wants before providing)
                             │ • Mini checklist to finish the flow in Adjust UI  


QR code for print / OOH      │ • Ready-to-copy Adjust short URL  
                             │ • Base-64 PNG or SVG payload (**only** if user asks) 


Push notification deep link  │ • `href` (gesund://…)  
                             │ • `navigation` array that matches React-Navigation  
                             │ • Blank template for title, body, linkLabel (user fills)

📂 4. Reference files
File                    │ Purpose
────────────────────────┼───────────────────────────────────────────────────────────────────────────────
linkingConfig.ts        │ Master list of valid in-app paths
redirectRules.ts             │ Legacy → new-path mapping (check **here first**)
linkingPrefixes.ts      │ Removes branded prefixes → canonical path
deeplink_targets.txt     │ Screen-to-“reference text” map (for confirmation questions)
README.md               │ How navigation works under the hood (you can use for your own understanding, to use for more complex cases, like fallback url, extra params, link-triggered actions, etc)
actionRoutes.ts    | Actions triggered by deeplinking



🔑 5. Deep-link basics
Scheme        │ Example
──────────────┼─────────────────────────────────────────────────────────────────────
App scheme    │ `gesund://pharmacy/_/4484444/`
Adjust short  │ `https://nnm2.adj.st/7h8c9w`  (prod)  
Prefixes      │ prod nnm2 • beta 8nhh • alpha eysl • dev snu8

Build rules  
1. Resolve the requested screen via **redirect.ts**, then verify existence in `linkingConfig.ts`.  
2. Fill all required params (`:idf`, etc.). If missing, ask the user.  
3. Never invent screens or params.  
4. Encode every query string with `encodeURIComponent`.  

⚙️ 6. Step-by-step wizards (for the user)

➊ Adjust link (2025 UI)  
1) Campaign Lab → Custom Links → “＋ New link”  
2) Choose app **gesund.de** (iOS & Android bundle)  
3) Fill *Channel* (required) plus *Campaign/Adgroup/Creative* (optional)  
4) “User destinations” → radio **In-app screen** → paste path from GPT  
5) Review → Create → copy short URL and/or QR

➋ Firebase push notification  
1) Firebase Console → Messaging → New campaign  
2) Fill Title, Body (user writes the text)  
3) Add key/value pairs:  
   • `href` = deep link (from GPT)  
   • `navigation` = array (from GPT)  
   • `linkLabel` (optional)  
4) Send test to own device (Settings → Version ×10 → Developer → Push notifications)  
5) Test foreground, background, closed app

🧪 7. Testing checklist
Scenario                        │ How to test
────────────────────────────────┼───────────────────────────────────────────────────────────────
Installed latest app            │ Paste link in WhatsApp
Older app version               │ Paste in Notes/e-mail
App not installed (deferred)    │ Tap link → store → open → verify params
QR on print                     │ Minimum 2 cm², error-correction M

To reset a device in Adjust (simulate first install):  
Adjust Dashboard → Test Devices → remove the device → relaunch the app.  
(Details: see Adjust docs, “Resetting Test Devices”.)

🛡 8. Safeguards
• **Ask** for any missing mandatory param.  
• **Confirm** the target screen by quoting its “reference text” from `deeplink_targets.ts`.  
• Warn if route not found in `linkingConfig.ts`.  
• Mention Dynamic Links deprecation (Aug 25 2025) if user suggests them.  
• Never auto-generate Adjust links (tokens required). Guide the user instead.  
• Keep language non-technical; replace jargon with plain words.  
• If conversation stalls, propose an e-mail to Patrick (patrick.dauelsberg@gesund.de) and draft it.

📣 9. Conversation flow (cheat-sheet for GPT)
1. Clarify the objective: “Which screen or asset do you need?”  
2. Ask for required IDs / params.  
3. Confirm screen via reference text.  
4. Generate path → navigation → UI checklist.  
5. Walk the user through Adjust or Firebase screens *one step at a time*.  
6. End with a “Done?” checklist covering tests & asset placement.

💬 10. Example prompt & response

**User**: “I need a QR code that opens the Linda pharmacy (idf = 12345) in the app.”  
**GPT**:  
1) “Got it! Just to confirm: can you upload a screenshot of this screen?”  
2) After:  
   • Deep-link path → `pharmacy/_/12345/`  
   • Navigation → `["Details",{"screen":"PharmacyDetails","params":{"idf":"12345"}}]`  
   • Adjust wizard steps 1-5 (prod prefix nnm2)  
   • Reminder: download the QR, test on iOS & Android, reset test device if needed

Feel free to use your knowledge to enhance the response.


--- DEEPLINK DOCUMENTATION START ---
linkingConfig
import { LinkingOptions } from "@react-navigation/native"
import RootStackParams from "navigation/RootStackParams"

export const linkingConfig: LinkingOptions<RootStackParams>["config"] = {
  screens: {
    // --- Top Level & Standalone Screens ---
    Playgrounds: "playgrounds/:q?",
    Intro: {
      path: "/intro/:id?",
      parse: {
        id: String,
        fallbackUrl: String,
        onboardingComplete: String,
      },
    },
    DeveloperSettings: "/about:flags",
    Feedback: "/feedback/:category?/:message?",
    Chat: "/chat/:id/:mode",
    PrivacyPolicy: "/privacyPolicy",
    CovidTestResultPdf: "/covidTestResultPdf/:id",
    PhysicianSearch: "/physician-search",
    PhysicianSearchHome: "/physician-search/home",
    MedicalStoreSearchHome: "/medicalstore-search-home",
    MedicalStoreFinder: "/medicalstore-finder/:mode?",
    Login: "/login/:followLink?",
    PreLogin: "/preLogin/:followLink?",
    Booking: "/booking/:shortName/:type",
    CwaDatenschutz: "/cwaDatenschutz",
    ResetPassword: "/resetPassword",
    ResetPasswordDone: "/reset-password-done/:email?",
    RegisterPayback: "/payback",
    Registration: "/register",
    RegistrationValidation: "/activation/:token",
    Terms: "/terms",
    LocalAuthScreen: "/reset-medatixx-pin/:token?",

    // --- Top-level Search Screens (moved from previous 'Search' grouping attempt) ---
    TestSearch: "/searchtest/:id?",
    SearchEntry: {
      path: "/search-entry/:id?",
      parse: { id: String },
    },
    SearchResults: {
      path: "/search-results/:searchTerm/:searchType?",
      parse: { searchTerm: String, searchType: String },
    },
    SearchProduct: {
      path: "/search-product/:id",
      parse: { id: String },
    },

    // --- Onboarding / Welcome ---
    Welcome: {
      path: "/onboarding",
      screens: {
        Welcome: {
          path: "welcome/:id?",
          parse: { id: Number },
        },
        Location: "location",
        About: "about",
        Faq: "faq",
      },
    },

    // --- Details Navigator ---
    Details: {
      path: "/details",
      screens: {
        OrderDetails: "order/:id/:type?",
        MedicalStoreOrderDetails: "medicalstore-order/:id",
        PharmacyDetails: {
          path: "pharmacy",
          parse: {
            pharmacyIdToAdd: String,
            pharmacyIdfToAdd: String,
          },
        },
        PhysicianDetails: { path: "physician/:id?/:setFavorite?", parse: { id: String, setFavorite: Boolean } },
        PraxisDetails: { path: "praxis/:bsuid/:setFavorite?", parse: { bsuid: String, setFavorite: Boolean } },
        AppointmentDetails: "appointment/:id",
        MedicalStoreDetails: "medicalstore/:id",
        ProductDetails: "product/:id",
        ImageSliderScreen: "product/:id/images",
      },
    },

    // --- Physician Medatixx Flow ---
    PhysicianMedatixx: {
      path: "/medatixx",
      screens: {
        MedatixxConnectionPreLogin: "prelogin",
        MedatixxConnection: "connection",
        MedatixxConnectionRequest: "request/:id?/:pairingId?",
        MedatixxConnectionRequestComplete: "request/complete",
      },
    },

    // --- Pharmacy Finder ---
    PharmacyFinder: {
      path: "/finder/:mode?/:searchTerm?/:deliveryZipcode?",
      parse: {
        mode: String,
        action: String,
        next: String,
        deliveryMethod: String,
        searchTerm: String,
        deliveryZipCode: String,
      },
    },

    // --- Checkout Flow ---
    Checkout: {
      path: "/checkout",
      screens: {
        CheckoutSummary: "summary",
        CheckoutPayment: "payment/:id?",
      },
    },

    // --- Profile Related (Standalone screens moved from Profile Tab for clarity) ---
    AddCollector: "profile/collector/add",
    UpdateCollector: "profile/collector/update/:id",
    AddReceiver: "profile/receiver/add",
    AddAddress: "profile/address/add/:type",
    EditAddress: "profile/address/edit/:type/:id",
    PersonalInfo: "profile/personal-info",
    ChangePassword: "profile/change-password",
    DeleteAccount: "profile/request-delete-account",
    PharmacyLegal: "/pharmacy-legal/:id/:type/:title",

    // --- Verification Flow ---
    Verification: {
      path: "/verification",
      screens: {
        VerifyPhoneNumber: "phone",
      },
    },

    // --- Main Tab Navigator ---
    Home: {
      initialRouteName: "Pharmacy",
      screens: {
        Pharmacy: {
          path: "pharmacy",
          screens: {
            PharmacyHome: "home/:egk?",
            ProductDetails: "product/:id",
            ProductList: "products/:category?",
            CategoryDetails: "category/:id",
            Campaign: "campaign/:id?",
            Basket: {
              path: "basket",
              screens: {
                BasketOverview: "",
                BasketCheckout: "checkout",
              },
            },
            Orders: "orders/:type?",
            SearchPharmacies: "search",
            ProductFilter: "product-filter",
            SearchResults: { path: "search/results/:searchTerm/:searchType?" },
            SearchProductListDetails: { path: "search/productlist/:tag", parse: { title: String } },
            SearchProductDetails: { path: "search/product/:id" },
            SearchTestSearch: { path: "search/test/:id?" },
            SearchFilter: { path: "search/filter" },
            SearchGuides: {
              path: "search/guides",
              screens: {
                GuidesHome: "",
                GuidesDetail: "guide/:id",
              },
            },
          },
        },
        Physicians: {
          path: "physicians",
          screens: {
            PhysicianSearchHome: "search",
            MyPhysicians: "my-physicians",
            MyDocuments: "my-documents",
            MyChats: "my-chats",
          },
        },
        MedicalStore: {
          path: "medicalstore",
          screens: {
            MedicalStoreHome: "",
            MedicalStoreBasket: "basket",
            MedicalStoreSearchHome: "search",
            MyMedicalStores: "my-medicalstores",
            Orders: "orders/:type?",
          },
        },
        MedicationPlan: {
          path: "medicationplan",
          screens: {
            MedicationPlanHome: "",
            MyMedications: "my-medications",
            MedicationPlanDetailsTab: "details/:id",
          },
        },
        Profile: {
          path: "profile",
          screens: {
            ProfileScreen: "",
            DeleteAccountConfirm: "delete/confirm/:token",
            ForgotPassword: {
              screens: {
                ForgotPasswordNew: "forgot-password/:token",
              },
            },
            Favourites: "fav",
            Contact: "contact/:category?",
            About: "about",
            Faq: {
              path: "faq",
              initialRouteName: "FaqOverview",
              screens: {
                FaqOverview: "",
                FaqTopic: ":topic",
                FaqTopicKey: "/faq/:topic/:topicKey",
              },
            },
            Imprint: "imprint",
            MyPhysicians: "myphysicians",
            Licenses: "about/licenses",
            Trademarks: {
              path: "trademarks",
              screens: {
                TrademarksHome: "",
                TrademarkDetails: ":title",
              },
            },
            Newsletter: {
              path: "newsletter",
              initialRouteName: "Newsletter",
              screens: {
                Newsletter: ":email?",
                NewsletterOptInConfirmation: "confirm/:token/:email",
                NewsletterUnsubscribe: "unsubscribe/:token/:email",
              },
            },
            DOIConfirmation: "doi-confirmation/:token/:email",
            UserInformation: "user-information",
            LocationOnboarding: "location-onboarding",
            MedicationPlan: "medicationplan",
            MyPharmacies: "my-pharmacies/:type?",
            Addresses: "addresses",
            CollectorReceiver: "collector-receiver",
            Orders: "orders/:type?",
            MainPharmacy: "main-pharmacy/:id",
            Appointments: "appointments",
            PharmacyRatings: {
              path: "pharmacy-ratings",
              initialRouteName: "PharmacyRatingsHome",
              screens: {
                PharmacyRatingsHome: "",
                PharmacyRatingEditScreen: ":id/edit",
              },
            },
            ProductDetails: "product/:id",
          },
        },
      },
    },

    // --- Health Card / NFC ---
    HealthCard: {
      path: "/nfc",
      screens: {
        TransferEprescription: "transfer",
      },
    },

    // --- Modals Navigator ---
    Modals: {
      path: "/modal",
      screens: {
        RequestPharmacy: "pharmacy-request/:id/:email?",
        OrderPickupSlip: "orderpickupslip",
        Pharmacies: "pharmacy-main",
        QRScanner: "search/scanner/:type",
        DeliveryTimeSelection: "delivery-time-selection",
        EPrescriptionScanner: "ePrescriptionScanner",
      },
    },
  },
}


linkingPrefixes:
import Config from "react-native-config"

export const prefixes: string[] = [
  "gesund:",
  "gesund://",
  "https://snu8.adj.st",
  "https://nnm2.adj.st",
  "https://eysl.adj.st",
  "https://gesund.de",
  "https://www.gesund.de",
  Config.ENV.toLowerCase() === "alpha" || __DEV__ ? "https://ecom-ref.gesund.de" : "",
  Config.ENV.toLowerCase() === "beta" || __DEV__ ? "https://ecom-pre.gesund.de" : "",
  __DEV__ ? "https://gesund-dev.loophole.site" : "",
  __DEV__ ? "https://gesund-dev-sandro.loophole.site" : "",
  __DEV__ ? "https://gesund-dev-mtheissen.loophole.site" : "",
  __DEV__ ? "https://gesund-dev-memet.loophole.site" : "",
].filter(Boolean)

export function prunePrefixes(path: string) {
  if (!path) {
    return path
  }
  let pruned = prefixes.reduce(
    (result, prefix) => (result.startsWith(prefix) ? result.substring(prefix.length) : result),
    path,
  )
  // Ensure the path starts with a single slash if it started with double slashes after pruning
  console.log(`[linkingPrefixes.ts] Path before double slash check: '${pruned}'`)
  if (pruned.startsWith("//")) {
    console.log("[linkingPrefixes.ts] Detected leading '//', removing one slash.")
    pruned = pruned.substring(1) // Remove one leading slash, result is e.g. "/pharmacy/someid"
  }
  console.log(`[linkingPrefixes.ts] Final pruned path: '${pruned}'`)
  return pruned
}

deeplink_targets.txt:
| Deeplink                                                              | Target Description                                        |
|-----------------------------------------------------------------------|-----------------------------------------------------------|
| pharmacy/search                                                       | Pharmacy Search Home                                      |
| finder                                                                | Pharmacy Finder                                           |
| apothekenfinder                                                       | Pharmacy Finder                                           |
| ePrescriptionScanner?mode=ePrescription                               | EPrescription Scanner                                     |
| e-rezept                                                              | EPrescription Scanner                                     |
| profile/imprint                                                       | Imprint                                                   |
| impressum                                                             | Imprint                                                   |
| privacyPolicy                                                         | Privacy Policy                                            |
| datenschutz                                                           | Privacy Policy                                            |
| terms                                                                 | Terms                                                     |
| agb                                                                   | Terms                                                     |
| feedback                                                              | Feedback                                                  |
| details/order/123                                                     | Order Details (Generic ID)                                |
| medicalStoreOrder/00000000-0000-0000-0000-000000000000                 | Medical Store Order Details (Generic ID)                  |
| login                                                                 | Login                                                     |
| register                                                              | Registration                                              |
| preLogin                                                              | PreLogin                                                  |
| profile/forgot-password/8ac5355f-9389-4320-ab8d-97071cba3c97           | Forgot Password New (Specific Token)                      |
| profil/passwort-vergessen                                             | Reset Password Request                                    |
| resetPassword                                                         | Reset Password Request                                    |
| reset-password-done                                                   | Reset Password Done Confirmation                          |
| activation/sometoken                                                  | Pwd Change Screen (Generic/Invalid Token)                 |
| profil/aktivierung/sometoken                                          | Pwd Change Screen (Generic/Invalid Token)                 |
| profile                                                               | Profile Overview                                          |
| profile/trademarks                                                    | Trademarks                                                |
| marken                                                                | Trademarks                                                |
| profile/contact                                                       | Contact                                                   |
| kontakt                                                               | Contact                                                   |
| profile/orders                                                        | Orders                                                    |
| profil/bestellung                                                     | Orders                                                    |
| profile/delete/confirm/sometoken                                      | Delete Account Confirm (Generic Token)                    |
| profil/loeschen?token=sometoken                                       | Delete Account Confirm (Generic Token)                    |
| profile/request-delete-account                                        | Delete Account Request                                    |
| profile/pharmacy-ratings                                              | Pharmacy Ratings                                          |
| profil/apothekenbewertungen                                           | Pharmacy Ratings                                          |
| profile/collector/add                                                 | Add Collector                                             |
| profile/collector/update/123                                          | Update Collector (Generic ID)                             |
| profile/receiver/add                                                  | Add Receiver                                              |
| profile/address/add/billing                                           | Add Address (Billing)                                     |
| profile/address/edit/delivery/123                                     | Edit Address (Delivery, Generic ID)                       |
| profile/personal-info                                                 | Personal Info                                             |
| profile/change-password                                               | Change Password                                           |
| payback                                                               | Register Payback                                          |
| profile/myphysicians                                                  | My Physicians                                             |
| profile/newsletter                                                    | Newsletter                                                |
| profile/medicationplan                                                | Medication Plan                                           |
| details/appointment/appt-1                                            | Appointment Details/List (Generic ID)                     |
| profil/termin                                                         | Appointments list/overview                                |
| booking/apo1/vacc                                                     | Booking (Generic ID)                                      |
| profile/doi-confirmation/token/email                                  | DOI Confirmation (Generic Token/Email)                    |
| profile/doi-confirmation/testtoken/testemail                          | DOI Confirmation (Test Token/Email)                       |
| details/product/1752-elmex-gelee                                      | Elmex Gelee Product Details                               |
| product/1581-dulcolax-dragees-magensaftresistente-tabletten           | Dulcolax Product Details                                  |
| produkt/3697-cystinol-akut-dragees                                    | Cystinol Product Details                                  |
| produkt/196436-gepan-mannose-gel                                      | Gepan Product Details                                     |
| search-product/1752-elmex-gelee                                       | Elmex Gelee Product Details                               |
| pharmacy/campaign/someInvalidId                                       | Campaign Error                                            |
| suche?list=Banner                                                     | Banner Campaign                                           |
| search-entry/abc                                                      | Search Entry/Results (Generic Term)                       |
| chat/order1/view                                                      | Chat (Generic Order ID)                                   |
| details/physician/dr-smith                                            | Physician Details (Generic ID)                            |
| details/praxis/9ab2743d-5e2e-4489-91b6-45295bfb6cab                   | Praxis Details (Specific ID)                              |
| medicalstore/store-x/                                                 | Medical Store Details (Generic ID)                        |
| physician-search                                                      | Physician Search                                          |
| physician/search                                                      | Physician Search                                          |
| medicalstore-finder                                                   | Medical Store Finder                                      |
| medicalStore/finder                                                   | Medical Store Finder                                      |
| checkout                                                              | Checkout Summary                                          |
| pharmacy-legal/a4311042-7703-4dfe-a996-aa1e12bd4ba3/terms/AGB         | Markt Apotheke Ovita Legal                                |
| pharmacy/a4311042-7703-4dfe-a996-aa1e12bd4ba3/legal/terms/AGB         | Markt Apotheke Ovita Legal                                |
| pharmacy/test-id/legal/terms/AGB                                      | Pharmacy Legal (Test ID)                                  |
| verification/phone                                                    | Verify Phone Number                                       |
| home                                                                  | Home Overview                                             |
| basket                                                                | Basket Overview                                           |
| nfc/transfer                                                          | Transfer Eprescription (or Login Prompt)                    |
| pharmacy/a4311042-7703-4dfe-a996-aa1e12bd4ba3/4484444                 | Markt Apotheke Ovita                                      |
| intro/test-id                                                         | Home Screen                                               |
| qrcode/a4311042-7703-4dfe-a996-aa1e12bd4ba3                            | Markt Apotheke Ovita                                      |
| qrcode/HP4Y3                                                          | KAPHINGST Sanitätshaus                                    |
| reset-medatixx-pin/token123                                           | Local Auth Screen                                         |
| search-results/aspirin/product                                        | Search Results                                            |
| home/category/8536                                                    | Category Details                                          |
| search/category/8536                                                  | Category Details                                          |
| medatixx/connection                                                   | Medatixx Connection                                       |
| medatixx/prelogin                                                     | Medatixx Pre-Login                                        |
| medatixx/request/123                                                  | Medatixx Connection Request                               |
| medatixx/request/complete                                             | Medatixx Connection Request Complete                      |
| pharmacy/orders                                                       | Pharmacy Orders                                           |
| physicians/my-physicians                                              | My Physicians                                             |
| modal/pharmacy-request/123                                            | Request Pharmacy Modal                                    |
| home/product/123                                                      | Product Details                                           |
| home/products/category                                                | Product List                                              |
| info/onboarding/confirm/token123/user@example.com                     | DOI Confirmation                                          | 



actionRoutes.ts
import { Alert, DeviceEventEmitter } from "react-native"
import SplashScreen from "react-native-bootsplash"

import { getStateFromPath as getStateFromPathDefault } from "@react-navigation/native"
import UnsecureStorage, { getSetting, setBooleanSetting, setNumberSetting, setStringSetting } from "UnsecureStorage"
import { takeMedication } from "medication/hooks/useTakenMedications"
import { displayNotification } from "notifications/utils/NotificationUtils"
import { removeSetting, resetAnonUserHard, resetAnonUserSoft, saveSetting } from "settings"
import { restart } from "utils/restart"
import { version } from "version"
import { z } from "zod"

import { enableDeveloperScreen } from "hooks/useDeveloperScreen"

import { makeSearchParamsObjectSchema } from "../../utils/urlParamUtils"

// ============================================================================
// Action Routes Map
// ============================================================================
// DEFINE YOUR ACTION ROUTES HERE.
// This map links URL paths (the keys) to specific functions (the values)
// that should execute when the path is matched by the linking handler.
//
// - Keys: The URL path segment (e.g., 'modal/recipe-scan', 'action/restart-app').
// - Values: A function that receives URLSearchParams and performs an action.
//           - It can return `undefined` (or void) to stop navigation.
//           - It can return a `string` (a new path) to redirect navigation.
//           - It can return a navigation state object.
//           - Action implementation functions can be defined below or imported.
// ============================================================================

export const ActionRoutes: Record<
  string,
  (params: URLSearchParams) => string | ReturnType<typeof getStateFromPathDefault> | void
> = {
  // --- Core Actions ---
  splash: splashActionImpl, // Defined below
  iddqd: enableDeveloperScreenActionImpl, // Defined below
  clearSession: clearSessionActionImpl, // Defined below
  setting: settingActionImpl, // Defined below

  // --- Shout Actions (using DeviceEventEmitter) ---
  chatShout: chatShoutActionImpl, // Defined below
  orderShout: orderShoutActionImpl, // Defined below
  successShout: successShoutActionImpl, // Defined below
  warningShout: warningShoutActionImpl, // Defined below

  // --- App State / Debug Actions ---
  "action/reset-app-state-hard": resetHardActionImpl, // Defined below
  "action/reset-app-state-soft": resetSoftActionImpl, // Defined below
  "action/reset-state-for-detox": detoxActionImpl, // Defined below
  "action/restart-app": restartActionImpl, // Defined below
  "action/skip-onboarding": skipOnboardingActionImpl, // Defined below

  // --- Custom Modal / Event Actions ---
  "modal/recipe-scan": openRecipeScanSheetActionImpl, // Defined below

  // --- Medication Related Actions (Now defined below) ---
  takeMedicine: takeMedicineActionImpl,
  toggleMedicine: toggleMedicineActionImpl,
  shoutMedicine: shoutMedicineActionImpl,

  // --- Medication Related Actions (Imported) ---
  // Remove spread syntax
  // ...medicationActions,
}

// ============================================================================
// Action Implementations & Helpers
// ============================================================================
// The actual functions that perform the actions linked in the map above.
// Keep this section below the ActionRoutes map.
// ============================================================================

// --- Helper Functions ---

// FIXME: remove once TS defines this type itself:
// https://github.com/microsoft/TypeScript/issues/32098
type RegExpGroups<T extends string[]> =
  | (RegExpMatchArray & {
      groups?:
        | {
            [name in T[number]]: string
          }
        | {
            [key: string]: string
          }
    })
  | null

function forEachParam(params: URLSearchParams, getKey = (key: string) => key) {
  let readOut: string[] = []
  params.forEach((value, key) => {
    const fullKey = getKey(key)
    if (!value) {
      const readValue = getSetting("global", fullKey)
      readOut.push(`${fullKey} = ${readValue} (${typeof readValue})`)
    }
    const match: RegExpGroups<["b", "n", "s"]> = value.match(/^(?<b>true|false|t|f|1|0|y|n)$|^(?<n>\d+)$|^(?<s>.*)$/i)
    let resolvedValue: boolean | number | string | undefined
    if (match?.groups?.b) {
      resolvedValue = /true|t|1|y/i.test(match.groups.b)
      setBooleanSetting("global", fullKey, resolvedValue)
    } else if (match?.groups?.n) {
      resolvedValue = parseFloat(match.groups.n)
      setNumberSetting("global", fullKey, resolvedValue)
    } else if (match?.groups?.s) {
      resolvedValue = match.groups.s
      setStringSetting("global", fullKey, resolvedValue)
    }
    resolvedValue !== undefined && console.log(`Setting ${fullKey} to ${resolvedValue} (${typeof resolvedValue})`)
  })
  if (readOut.length) {
    Alert.alert("Settings", readOut.join("\n"))
  }
}

const ShoutParams = makeSearchParamsObjectSchema({
  title: z.string().default("Adler Apotheke"),
  message: z.string().optional(),
  link: z.string().default("Zur Nachricht"),
})

// --- Medication Action Helpers ---
// Added from medicationActions.ts
const idSchema = z.string().array().min(1).describe("One or more IDs of medications.")
const dateSchema = z
  .string()
  .datetime({ offset: true })
  .pipe(z.coerce.date())
  .describe("The date in ISO format to mark this medication as taken.")
const takeMedicationSchema = makeSearchParamsObjectSchema({
  id: idSchema,
  date: dateSchema,
})

// --- Implementation Functions ---

function splashActionImpl() {
  SplashScreen.getVisibilityStatus()
    .then((state) => {
      if (state === "visible") {
        return SplashScreen.hide({ fade: true })
      }
      return
    })
    .catch(() => {})
}

function enableDeveloperScreenActionImpl() {
  enableDeveloperScreen()
  return "/about:flags"
}

function clearSessionActionImpl() {
  console.log("Clearing persisted session")
  removeSetting("session", "secure").catch(null)
}

function chatShoutActionImpl(params: URLSearchParams) {
  const { title, message = "Ihre Bestellung ist abholbereit.", link } = ShoutParams.parse(params)
  DeviceEventEmitter.emit("CHAT", {
    title,
    message,
    link,
  })
}

function orderShoutActionImpl(params: URLSearchParams) {
  const { title, message = "Ihre Bestellung ist abholbereit.", link } = ShoutParams.parse(params)
  DeviceEventEmitter.emit("ORDER", {
    title,
    message,
    link,
  })
}

function successShoutActionImpl(params: URLSearchParams) {
  const { title, message = "Da hat etwas geklappt.", link } = ShoutParams.parse(params)
  DeviceEventEmitter.emit("SUCCESS", {
    title,
    message,
    link,
  })
}

function warningShoutActionImpl(params: URLSearchParams) {
  const {
    title,
    message = "Es ist ein technischer Fehler auftreten. Bitte versuchen Sie es später noch einmal. Falls das Problem längere Zeit bestehen sollte, schreiben Sie uns bitte über das [Kontaktformular](https://gesund.de/kontakt).",
    link,
  } = ShoutParams.parse(params)
  DeviceEventEmitter.emit("WARNING", {
    title,
    message,
    link,
  })
}

function settingActionImpl(params: URLSearchParams) {
  forEachParam(params)
}

function resetHardActionImpl() {
  void resetAnonUserHard()
}

function resetSoftActionImpl() {
  void resetAnonUserSoft()
}

function detoxActionImpl(params: URLSearchParams) {
  console.log("detox action here", params)
  UnsecureStorage.clear()
  removeSetting("session", "secure")
  saveSetting("welcome/shown", version)
  forEachParam(params)
  restart()
  return "/home"
}

function restartActionImpl() {
  restart()
}

function skipOnboardingActionImpl() {
  console.log("Skipping onboarding by setting welcome/shown flag")
  saveSetting("welcome/shown", version)
  return "/home"
}

function openRecipeScanSheetActionImpl() {
  console.log("[ActionRoutes] Triggering OPEN_RECIPE_SCAN_SHEET event.")
  DeviceEventEmitter.emit("OPEN_RECIPE_SCAN_SHEET")
  return undefined
}

// Added from medicationActions.ts

function takeMedicineActionImpl(params: URLSearchParams) {
  let { id, date } = takeMedicationSchema.parse(params)
  takeMedication(id, date)
  // Returns void implicitly
}

function toggleMedicineActionImpl(params: URLSearchParams) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let { id, date } = takeMedicationSchema.parse(params)
  // eslint-disable-next-line no-loops/no-loops, @typescript-eslint/no-unused-vars
  for (let _index of id) {
    // toggleMedicationTime(index, date) //FIXME: when is supposed to be used
  }
  // Returns void implicitly
}

function shoutMedicineActionImpl(params: URLSearchParams) {
  let { id, date: time } = takeMedicationSchema.parse(params)
  const timeString = time.toLocaleTimeString("de", { hour: "2-digit", minute: "2-digit" })

  displayNotification(
    `${id}-${0}`,
    `DRINGEND`, //i18n
    "Bestätige die Einnahme in der gesund.de App.", //i18n
    {
      sound: "default",
      pressAction: {
        id: "medications",
      },
      actions: [
        {
          title: "Eingenommen", //i18n
          pressAction: {
            id: "taken",
          },
        },
      ],
    },
    {
      sound: "default",
      critical: true,
      interruptionLevel: "critical",
      categoryId: "medication",
    },
    `Erinnerung an deine Einnahme um ${timeString} Uhr.`, //i18n
    {
      time: time.toISOString(),
    },
  )
  // Returns void implicitly
}

redirectRules:
import { isUUID } from "api/isUUID"

/**
 * Redirect Rules Map.
 * Keys are the path prefixes to match (should generally be normalized without trailing slashes unless significant).
 * Values are the target path (string) or a function to generate the target path (RedirectValue).
 * Order is important: rules are evaluated top-to-bottom by the logic in `redirect.ts`.
 * More specific rules MUST come before potentially conflicting general ones.
 */
export const Redirects: Record<string, RedirectValue> = {
  // --- Simple Aliases/Top-Level ---
  "/dev": "about:flags",
  "/apothekenfinder": "/finder",
  "/basket": "pharmacy/basket",
  "/e-rezept": "/modal/ePrescriptionScanner?mode=ePrescription",
  "/ueber-uns": "https://www.gesund.de/ueber-uns",
  "/impressum": "profile/imprint",
  "/datenschutz": "/privacyPolicy",
  "/agb": "/terms",
  "/ratgeber": "https://www.gesund.de/ratgeber",
  "/marken": "profile/trademarks",
  "/merkliste": "profile/fav",
  "/kontakt": "profile/contact",
  "/rezept": "/ePrescriptionScanner",
  "/privacy": "/privacyPolicy",
  "/profileoverview": "profile",

  // --- Pharmacy Main Modal ---
  "/apotheke/stammapotheke": "/modal/pharmacy-main",
  "/pharmacy/main/delete": "/modal/pharmacy-main",

  // --- Search Redirects ---
  "/search/filter": "pharmacy/search/filter", // Simple
  "/searchPharmacies": "pharmacy/search", // Simple
  "/searchInit": "pharmacy/search", // Simple
  "/search/results": createPrefixRedirect("/search/results", "pharmacy/search/results"), // Complex (Prefix)
  "/search/category": createPrefixRedirect("/search/category", "pharmacy/category"), // Complex (Prefix)
  "/search/productlist": createPrefixRedirect("/search/productlist", "pharmacy/search/productlist"), // Complex (Prefix)
  "/search/scanner": createPrefixRedirect("/search/scanner", "/modal/search/scanner"), // Complex (Prefix)

  // --- Profile Tab Redirects ---
  "/profil/apothekenbewertungen": "profile/pharmacy-ratings", // Simple
  "/profil/passwort-vergessen": (basePath: string): string => {
    // Complex (Function)
    const tokenMatch = basePath.match(/^\/profil\/passwort-vergessen\/([^\/?#]+)/)
    if (tokenMatch && tokenMatch[1]) {
      const token = tokenMatch[1]
      const newPath = `profile/forgot-password/${token}`
      console.log(
        `[redirectRules.ts] Handler: Redirecting /profil/passwort-vergessen/:token path "${basePath}" to "${newPath}"`,
      )
      return newPath
    }
    console.log(`[redirectRules.ts] Handler: Redirecting "${basePath}" to /resetPassword`)
    return "/resetPassword"
  },
  "/profil/aktivierung": createPrefixRedirect("/profil/aktivierung", "/activation"), // Complex (Prefix)
  "/profil/bestellung": createPrefixRedirect("/profil/bestellung", "profile/orders"), // Complex (Prefix)
  "/profil/loeschen": (basePath) => {
    // Complex (Function with query check)
    const tokenMatch = basePath.match(/^\/profil\/loeschen\?token=([^&]+)/)
    if (tokenMatch && tokenMatch[1]) {
      return `profile/delete/confirm/${tokenMatch[1]}`
    }
    return basePath
  },
  "/profil/termin": createPrefixRedirect("/profil/termin", "profile/appointments"), // Complex (Prefix)

  // --- Specific /pharmacy/... handlers FIRST ---
  "/pharmacy/:id/main": (basePath: string): string => {
    // Complex (Function)
    const mainPharmacyMatch = basePath.match(/^\/pharmacy\/([^\/]+)\/main$/)
    if (mainPharmacyMatch) {
      const id = mainPharmacyMatch[1]
      const newPath = `profile/main-pharmacy/${id}`
      console.log(`[redirectRules.ts] Handler: Redirecting OLD Main Pharmacy path "${basePath}" to "${newPath}"`)
      return newPath
    }
    return basePath
  },
  "/pharmacy/home": createPrefixRedirect("/pharmacy/home", "pharmacy/home"), // Complex (Prefix)
  "/pharmacy/product/filter": createPrefixRedirect("/pharmacy/product/filter", "pharmacy/product-filter"), // Complex (Prefix)
  "/pharmacy/product": createPrefixRedirect("/pharmacy/product", "pharmacy/product"), // Complex (Prefix)
  "/pharmacy/products": createPrefixRedirect("/pharmacy/products", "pharmacy/products"), // Complex (Prefix)
  "/pharmacy/category": createPrefixRedirect("/pharmacy/category", "pharmacy/category"), // Complex (Prefix)
  "/pharmacy/orders": createPrefixRedirect("/pharmacy/orders", "pharmacy/orders"), // Complex (Prefix)
  "/pharmacy/medicationplan/duplicate": createPrefixRedirect(
    "/pharmacy/medicationplan/duplicate",
    "pharmacy/medicationplan-duplicate",
  ), // Complex (Prefix)
  "/pharmacy/:id/request": (basePath: string) => {
    // Complex (Function)
    const requestMatch = basePath.match(/^\/pharmacy\/([^/]+)\/request(\/.*)?$/)
    if (requestMatch) {
      const pharmacyId = requestMatch[1]
      const remainingPath = requestMatch[2] || ""
      const newPath = `/modal/pharmacy-request/${pharmacyId}${remainingPath}`
      console.log(
        `[redirectRules.ts] Handler: Redirecting /pharmacy/:id/request/... path "${basePath}" to "${newPath}"`,
      )
      return newPath
    }
    return basePath
  },
  "/pharmacy/search": (basePath: string) => {
    // Complex (Function - exact match)
    if (basePath === "/pharmacy/search") {
      const newBasePath = "pharmacy/search"
      console.log(`[redirectRules.ts] Handler: Redirecting OLD Pharmacy Search path "${basePath}" to "${newBasePath}"`)
      return newBasePath
    }
    return basePath
  },

  // --- /pharmacy/ base handler (AFTER specific ones) ---
  "/pharmacy": (basePath: string) => {
    // Complex (Function - handles legal and details)
    const legalMatch = basePath.match(/^\/pharmacy\/([^\/]+)\/legal(\/.*)?$/)
    if (legalMatch) {
      const pharmacyId = legalMatch[1]
      const legalParams = legalMatch[2] || ""
      const newBasePath = `/pharmacy-legal/${pharmacyId}${legalParams}`
      console.log(`[redirectRules.ts] Handler: Redirecting OLD Pharmacy Legal path "${basePath}" to "${newBasePath}"`)
      return newBasePath
    }
    const detailsMatch = basePath.match(/^\/pharmacy\/([^\/?#]+)(?:\/([^\/?#]+))?(?:[\/?#]|$)/)
    const nextSegment = basePath.split("/")[2]
    const knownSubPaths = [
      "home",
      "product",
      "products",
      "category",
      "orders",
      "medicationplan",
      "ratings",
      "request",
      "search",
      "main",
      "legal",
    ]
    if (detailsMatch && detailsMatch[1] && !knownSubPaths.includes(nextSegment)) {
      const id = detailsMatch[1]
      const idf = detailsMatch[2]
      let newBasePath = `/details/pharmacy?pharmacyIdToAdd=${id}`
      if (idf && idf !== "_") {
        newBasePath += `&pharmacyIdfToAdd=${idf}`
      }
      console.log(`[redirectRules.ts] Handler: Redirecting OLD Pharmacy Details path "${basePath}" to "${newBasePath}"`)
      return newBasePath
    }
    return basePath
  },

  // --- Other Complex Handlers ---
  "/intro": (basePath: string) => {
    // Complex (Function - intro with params)
    const match = basePath.match(/^\/intro\/([^/?#]+)\/([^/?#]+)?$/)
    if (match) {
      const id = match[1]
      const idf = match[2]
      let newBasePath = `/intro?pharmacyIdToAdd=${id}`
      if (idf && idf !== "_") {
        newBasePath += `&pharmacyIdfToAdd=${idf}`
      }
      console.log(`[redirectRules.ts] Handler: Redirecting OLD Intro path "${basePath}" to "${newBasePath}"`)
      return newBasePath
    }
    return basePath
  },
  "/praxis": (basePath: string) => {
    // Complex (Function - praxis with UUID check)
    const praxisMatch = basePath.match(/^\/praxis\/([a-fA-F0-9-]+)(?:\/([^/?#]+))?(?:[\/?#]|$)/)
    if (praxisMatch && isUUID(praxisMatch[1])) {
      const newPath = `/details${basePath}`
      console.log(`[redirectRules.ts] Handler: Redirecting legacy Praxis path "${basePath}" to "${newPath}"`)
      return newPath
    }
    return basePath
  },
  "/home/category": createPrefixRedirect("/home/category", "pharmacy/category"), // Complex (Prefix)
  "/home/product": createPrefixRedirect("/home/product", "pharmacy/product"), // Complex (Prefix)
  "/home/products": createPrefixRedirect("/home/products", "pharmacy/products"), // Complex (Prefix)
  "/home": (basePath) => {
    // Complex (Function - exact match)
    if (basePath === "/home" || basePath === "/home/") {
      console.log(`[redirectRules.ts] Handler: Redirecting base "${basePath}" to "pharmacy"`)
      return "pharmacy"
    }
    return basePath
  },
  "/campaign": createPrefixRedirect("/campaign", "pharmacy/campaign"), // Complex (Prefix)
  "/medicalstore": createPrefixRedirect("/medicalstore", "/details/medicalstore"), // Complex (Prefix)
  "/medicalStoreOrder": createPrefixRedirect("/medicalStoreOrder", "/details/medicalstore-order"), // Complex (Prefix)
  "/produkt": createPrefixRedirect("/produkt", "/details/product"), // Complex (Prefix)
  "/product": createPrefixRedirect("/product", "/details/product"), // Complex (Prefix)
  "/physician/search/home": createPrefixRedirect("/physician/search/home", "/physician-search/home"), // Complex (Prefix)
  "/medatixxConnectionRequest": createPrefixRedirect("/medatixxConnectionRequest", "/medatixx/request"), // Complex (Prefix)
  "/qrcode": (basePath: string) => {
    // Complex (Function - QR code logic)
    const qrCodeMatch = basePath.match(/^\/qrcode\/([^\/?#]+)/)
    if (qrCodeMatch && qrCodeMatch[1]) {
      const id = qrCodeMatch[1]
      let fallbackTarget: string
      let primaryTargetParam: string
      if (isUUID(id)) {
        fallbackTarget = `/details/pharmacy?pharmacyIdToAdd=${id}`
        primaryTargetParam = `pharmacyIdToAdd=${id}`
      } else {
        fallbackTarget = `/details/medicalstore/${id}`
        primaryTargetParam = `id=${id}`
      }
      const primaryTarget = `/intro?fallbackUrl=${encodeURIComponent(fallbackTarget)}&${primaryTargetParam}`
      console.log(`[redirectRules.ts] Handler: Redirecting QR code path '${basePath}' to Intro: '${primaryTarget}'`)
      return primaryTarget
    }
    return basePath
  },
  "/info/onboarding/confirm": (basePath: string) => {
    // Complex (Function - DOI confirm)
    const doiMatch = basePath.match(/^\/info\/onboarding\/confirm\/([^\/?#]+)\/([^\/?#]+)/)
    if (doiMatch && doiMatch[1] && doiMatch[2]) {
      const token = doiMatch[1]
      const email = doiMatch[2]
      const targetUrl = `profile/doi-confirmation/${token}/${email}`
      console.log(`[redirectRules.ts] Handler: Redirecting DOI confirm path '${basePath}' to '${targetUrl}'`)
      return targetUrl
    }
    return basePath
  },

  // --- Renamed Top-Level Navigators (Simple) ---
  "/physician/search": "/physician-search",
  "/medicalStore/finder": "/medicalstore-finder",
  "/medicalStore/search/home": "/medicalstore-search-home",
}

/**
 * Defines the type for a redirect value.
 * It can be a simple string replacement or a function that dynamically generates the redirected path.
 * The function receives the original base path and returns the new target base path
 * (potentially with new query parameters, but *without* the original query string).
 */
export type RedirectValue = string | ((basePath: string) => string)

/**
 * Helper function to create prefix-based redirect handlers.
 */
function createPrefixRedirect(oldPrefix: string, newPrefix: string): RedirectValue {
  return (basePath: string) => {
    const normalizedBasePath = basePath.endsWith("/") && basePath.length > 1 ? basePath.slice(0, -1) : basePath

    if (normalizedBasePath.startsWith(oldPrefix)) {
      const charAfterPrefix = normalizedBasePath[oldPrefix.length]
      if (charAfterPrefix === undefined || charAfterPrefix === "/" || charAfterPrefix === "?") {
        const remainingPath = normalizedBasePath.substring(oldPrefix.length)
        const newPath = newPrefix + remainingPath
        console.log(`[redirectRules.ts] Prefix Handler: Redirecting "${oldPrefix}" in "${basePath}" to "${newPath}"`)
        return newPath
      }
    }
    return basePath
  }
}


--- DEEPLINK DOCUMENTATION END ---
"""
# --- END OF DEEPLINK INSTRUCTIONS ---


# --- Streamlit App Layout ---
st.set_page_config(page_title=PAGE_TITLE, page_icon=LOGO_PATH)

# Display Logo and Title
if os.path.exists(LOGO_PATH):
    st.image(LOGO_PATH, width=100)
else:
    st.warning(f"Warning: Logo file not found at {LOGO_PATH}")

st.title(PAGE_TITLE)
st.caption("Ask me to generate a deeplink or analyze an image based on our app's rules.")

# --- Gemini API Interaction ---
try:
    # SECURELY get API key from Streamlit Secrets
    api_key = st.secrets["GEMINI_API_KEY"]
    genai.configure(api_key=api_key)
    # Use a model that supports multimodal input (text and image)
    model = genai.GenerativeModel('gemini-1.5-flash-latest') # Or gemini-1.5-pro
except Exception as e:
    st.error(f"""
    Error configuring Gemini API. Make sure you have added your Gemini API Key
    to the Streamlit Cloud secrets. Name the secret 'GEMINI_API_KEY'.

    Details: {e}
    """)
    st.stop()

# --- User Input ---

# Image Uploader
uploaded_file = st.file_uploader("Upload an image (optional)", type=["png", "jpg", "jpeg"])
image_input = None
if uploaded_file is not None:
    # Read the file content into bytes
    image_bytes = uploaded_file.getvalue()
    # Open the image using Pillow
    try:
        image_input = Image.open(io.BytesIO(image_bytes))
        st.image(image_input, caption="Uploaded Image", use_column_width=True)
    except Exception as e:
        st.error(f"Error processing image: {e}")
        uploaded_file = None # Reset if image processing fails

# Text Input
user_request = st.text_area("What do you need?", height=100,
                            placeholder=("e.g., 'Create a link to the product page for SKU ABC007' OR "
                                         "'Generate a deeplink for the product in the image with campaign source facebook' OR "
                                         "'Describe the uploaded image for social media.'"))

if st.button("Generate Response"):
    if not user_request:
        st.warning("Please enter your request in the text box.")
    elif not api_key:
         st.error("Gemini API Key not configured in secrets. Cannot proceed.")
    else:
        # --- Construct the prompt (potentially multimodal) ---
        prompt_parts = [INSTRUCTIONS] # Start with the base instructions

        if image_input:
            # If an image is uploaded, add it to the prompt parts
            prompt_parts.append("\n\n--- IMAGE INPUT ---")
            prompt_parts.append(image_input) # Add the PIL image object
            prompt_parts.append("\n\n--- USER REQUEST (Consider Image) ---")
            prompt_parts.append(user_request)
            prompt_parts.append("\n\n--- RESPONSE ---")
        else:
            # If no image, construct a text-only prompt
             prompt_parts.append("\n\n--- USER REQUEST ---")
             prompt_parts.append(user_request)
             prompt_parts.append("\n\n--- RESPONSE ---")

        # --- Call Gemini API ---
        try:
            with st.spinner("Generating response with Gemini..."):
                # Use generate_content which handles multimodal input list
                response = model.generate_content(prompt_parts)
                # Display the result
                st.subheader("Generated Response:")
                st.markdown(response.text)

        except Exception as e:
            st.error(f"An error occurred while calling the Gemini API: {e}")
            # You might want more specific error handling here
            # print(f"Error details: {e}") # For debugging in logs

st.markdown("---")
st.caption("Remember to double-check generated deeplinks and analyze image interpretations.")

