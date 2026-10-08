
const { chromium } = require("playwright");
const path = require("path");
const { getISSDistance } = require("./iss");

const AUTH_FILE = path.join(
  __dirname,
  "playwright",
  ".auth",
  "instagram.json"
);

const INSTAGRAM_EDIT_URL =
  "https://www.instagram.com/accounts/edit/";

const UPDATE_INTERVAL = 60 * 1000;
const RETRY_INTERVAL = 15 * 1000;

const MAX_UPDATE_ATTEMPTS = 3;

let updateInProgress = false;

// ============================================================
// BIO
// ============================================================

function buildBio(formattedDistance) {
  return (
    "ᴄɴᴇɢ ✎𓂃\n" +
    "‎ ‎ ‎ 𓆝 𓆟 𓆞 𓆝 𓆟\n" +
    "𝘁𝗵𝗲𝗮𝘁𝗿𝗲 𝗮𝗰𝘁𝗼𝗿 ‎ ᯓ★\n" +
    "since like 5 years ago ‎ ˙𐃷˙\n" +
    `࣪ ִֶָ☾. ${formattedDistance} 𝐤𝐦 𝚏𝚛𝚘𝚖 𝐈𝐒𝐒`
  );
}

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================
// PAGE ERROR STATE
// ============================================================

function createPageErrorState() {
  return {
    requestFailed: false,
    pageError: false,
    crashed: false,
    messages: [],
  };
}

function installPageErrorDetection(
  page,
  errorState
) {
  page.on("requestfailed", (request) => {
    const failure =
      request.failure();

    errorState.requestFailed = true;

    const message =
      failure?.errorText ||
      "Unknown request failure";

    errorState.messages.push(
      `Request failed: ${message}`
    );

    console.log(
      `⚠️ Browser request failed: ${message}`
    );
  });

  page.on("pageerror", (error) => {
    errorState.pageError = true;

    errorState.messages.push(
      `Page error: ${error.message}`
    );

    console.log(
      `⚠️ Instagram page error: ${error.message}`
    );
  });

  page.on("crash", () => {
    errorState.crashed = true;

    errorState.messages.push(
      "Browser page crashed."
    );

    console.log(
      "💥 Instagram browser page crashed."
    );
  });
}

function hasFatalPageError(
  errorState
) {
  return (
    errorState.crashed ||
    errorState.pageError
  );
}

// ============================================================
// INSTAGRAM ERROR DETECTION
// ============================================================

async function detectInstagramErrorPage(
  page
) {
  if (page.isClosed()) {
    return "Instagram browser page was closed.";
  }

  const url = page.url();

  if (
    url.includes("/accounts/login") ||
    url.includes("/login")
  ) {
    return (
      "Instagram session has expired or login is required."
    );
  }

  let bodyText = "";

  try {
    bodyText =
      await page
        .locator("body")
        .innerText({
          timeout: 1000,
        });
  } catch {
    return null;
  }

  const patterns = [
    /something went wrong/i,
    /sorry, we couldn't load the page/i,
    /sorry, we couldn't load/i,
    /try again later/i,
    /page isn't available/i,
    /this page isn't available/i,
    /couldn't refresh/i,
    /network error/i,
    /no internet connection/i,
    /internet connection/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(bodyText)) {
      return (
        "Instagram displayed a page/connection error."
      );
    }
  }

  return null;
}

// ============================================================
// BIO FIELD
// ============================================================

async function findBioField(page) {
  const selectors = [
    'textarea[placeholder="Bio"]',
    'textarea[aria-label="Bio"]',
    'textarea[name="biography"]',
    "textarea",
  ];

  for (const selector of selectors) {
    try {
      const locator =
        page.locator(selector).first();

      if (
        await locator.isVisible({
          timeout: 300,
        })
      ) {
        return locator;
      }
    } catch {
      // Continue.
    }
  }

  return null;
}

async function waitForBioField(
  page,
  errorState
) {
  console.log(
    "🔎 Waiting for Instagram Bio field..."
  );

  const timeout = 20000;
  const start = Date.now();

  let lastErrorCheck = 0;

  while (
    Date.now() - start <
    timeout
  ) {
    if (page.isClosed()) {
      throw new Error(
        "Instagram browser page was closed."
      );
    }

    if (
      hasFatalPageError(errorState)
    ) {
      throw new Error(
        errorState.messages[
          errorState.messages.length - 1
        ] ||
          "Instagram page encountered an error."
      );
    }

    if (
      Date.now() - lastErrorCheck >=
      1000
    ) {
      lastErrorCheck = Date.now();

      const pageError =
        await detectInstagramErrorPage(
          page
        );

      if (pageError) {
        throw new Error(
          pageError
        );
      }
    }

    const bioField =
      await findBioField(page);

    if (bioField) {
      console.log(
        "✅ Instagram Bio field detected."
      );

      return bioField;
    }

    await sleep(300);
  }

  throw new Error(
    "Instagram Bio field did not appear within 20 seconds."
  );
}

// ============================================================
// OPEN EDIT PROFILE
// ============================================================

async function openEditProfile(
  page,
  errorState
) {
  console.log(
    "🌐 Opening Instagram Edit Profile..."
  );

  let response;

  try {
    response =
      await page.goto(
        INSTAGRAM_EDIT_URL,
        {
          waitUntil:
            "domcontentloaded",
          timeout: 30000,
        }
      );
  } catch (error) {
    throw new Error(
      `Instagram navigation failed: ${error.message}`
    );
  }

  if (
    response &&
    response.status() >= 400
  ) {
    throw new Error(
      `Instagram returned HTTP ${response.status()} while opening Edit Profile.`
    );
  }

  const pageError =
    await detectInstagramErrorPage(
      page
    );

  if (pageError) {
    throw new Error(
      pageError
    );
  }

  return await waitForBioField(
    page,
    errorState
  );
}

// ============================================================
// VALIDATION
// ============================================================

function normalize(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\uFEFF/g, "")
    .trimEnd();
}

function validateBioText(
  value,
  formattedDistance
) {
  const normalized =
    normalize(value);

  const expected =
    normalize(
      buildBio(formattedDistance)
    );

  if (normalized !== expected) {
    return {
      valid: false,
      reason:
        "The bio does not exactly match the required text.",
    };
  }

  return {
    valid: true,
    reason:
      "Bio text is correct.",
  };
}

// ============================================================
// SUBMIT BUTTON
// ============================================================

async function findSubmitButton(page) {
  const candidates = [
    page.getByRole("button", {
      name: /^Submit$/i,
    }),

    page.getByRole("button", {
      name: /submit/i,
    }),

    page.locator(
      'button[type="submit"]'
    ),

    page.locator("button").filter({
      hasText: /^Submit$/i,
    }),

    page.locator("button").filter({
      hasText: /submit/i,
    }),
  ];

  for (const candidate of candidates) {
    try {
      const count =
        await candidate.count();

      for (
        let i = 0;
        i < count;
        i++
      ) {
        const button =
          candidate.nth(i);

        if (
          await button.isVisible({
            timeout: 300,
          })
        ) {
          return button;
        }
      }
    } catch {
      // Continue.
    }
  }

  return null;
}

// ============================================================
// SAVE DETECTION
// ============================================================

async function detectSavedMessage(page) {
  const patterns = [
    /^Saved$/i,
    /changes saved/i,
    /profile saved/i,
  ];

  for (const pattern of patterns) {
    try {
      const elements =
        page.getByText(pattern);

      const count =
        await elements.count();

      for (
        let i = 0;
        i < count;
        i++
      ) {
        const element =
          elements.nth(i);

        if (
          await element.isVisible({
            timeout: 200,
          })
        ) {
          return true;
        }
      }
    } catch {
      // Continue.
    }
  }

  return false;
}

// ============================================================
// VERIFY SAVE
// ============================================================

async function verifySavedBio(
  page,
  formattedDistance,
  errorState
) {
  console.log(
    "💾 Waiting for Instagram to confirm save..."
  );

  const start =
    Date.now();

  while (
    Date.now() - start <
    30000
  ) {
    if (
      hasFatalPageError(errorState)
    ) {
      throw new Error(
        errorState.messages[
          errorState.messages.length - 1
        ] ||
          "Instagram encountered a browser error while saving."
      );
    }

    const pageError =
      await detectInstagramErrorPage(
        page
      );

    if (pageError) {
      throw new Error(
        pageError
      );
    }

    if (
      await detectSavedMessage(page)
    ) {
      console.log(
        "✅ Instagram confirmed the save."
      );

      return true;
    }

    await sleep(500);
  }

  console.log(
    "🔎 No explicit save message detected."
  );

  console.log(
    "🔄 Reloading to verify persistence..."
  );

  try {
    await page.reload({
      waitUntil:
        "domcontentloaded",
      timeout: 30000,
    });
  } catch (error) {
    throw new Error(
      `Could not reload Instagram: ${error.message}`
    );
  }

  const bioField =
    await waitForBioField(
      page,
      errorState
    );

  if (!bioField) {
    throw new Error(
      "Bio field not found after save."
    );
  }

  const savedBio =
    await bioField.inputValue();

  console.log(
    "\n🔎 Bio after reload:"
  );

  console.log(
    "----------------------------------------"
  );

  console.log(savedBio);

  console.log(
    "----------------------------------------"
  );

  const validation =
    validateBioText(
      savedBio,
      formattedDistance
    );

  if (!validation.valid) {
    throw new Error(
      `Saved bio verification failed: ${validation.reason}`
    );
  }

  console.log(
    "✅ Bio persisted correctly."
  );

  return true;
}

// ============================================================
// ENTER BIO
// ============================================================

async function enterBio(
  bioField,
  formattedDistance
) {
  const targetBio =
    buildBio(formattedDistance);

  console.log(
    "✏️ Clearing current bio..."
  );

  await bioField.click();

  await bioField.press(
    "ControlOrMeta+A"
  );

  await bioField.press(
    "Backspace"
  );

  console.log(
    "✏️ Typing bio text..."
  );

  await bioField.pressSequentially(
    targetBio,
    {
      delay: 5,
    }
  );

  await sleep(500);

  const value =
    await bioField.inputValue();

  console.log(
    "\n📝 Bio currently in Instagram:"
  );

  console.log(
    "----------------------------------------"
  );

  console.log(value);

  console.log(
    "----------------------------------------"
  );

  return value;
}

// ============================================================
// SINGLE INSTAGRAM ATTEMPT
// ============================================================

async function attemptInstagramUpdate(
  page,
  errorState,
  formattedDistance,
  attempt
) {
  console.log(
    `\n🔄 Instagram update attempt ${attempt}/${MAX_UPDATE_ATTEMPTS}`
  );

  const bioField =
    await openEditProfile(
      page,
      errorState
    );

  const enteredBio =
    await enterBio(
      bioField,
      formattedDistance
    );

  console.log(
    "🔍 Checking bio before Submit..."
  );

  const validation =
    validateBioText(
      enteredBio,
      formattedDistance
    );

  if (!validation.valid) {
    console.log(
      "🚫 NOT SAVING."
    );

    throw new Error(
      `Bio validation failed: ${validation.reason}`
    );
  }

  console.log(
    "✅ Bio is correct. Safe to submit."
  );

  const submitButton =
    await findSubmitButton(page);

  if (!submitButton) {
    throw new Error(
      "Submit button could not be found."
    );
  }

  console.log(
    "💾 Clicking Submit..."
  );

  await submitButton.click();

  await verifySavedBio(
    page,
    formattedDistance,
    errorState
  );

  console.log(
    "✅ SAVE CONFIRMED."
  );
}

// ============================================================
// FRESH ISS POSITION
// ============================================================

async function getFreshISSData() {
  console.log(
    "\n🛰️ Getting CURRENT ISS position..."
  );

  const result =
    await getISSDistance();

  if (
    !result ||
    typeof result.distanceKm !==
      "number" ||
    typeof result.formattedDistance !==
      "string"
  ) {
    throw new Error(
      "ISS API returned invalid distance data."
    );
  }

  console.log(
    `📐 Current distance: ${result.formattedDistance} 𝚔𝚖`
  );

  return result;
}

// ============================================================
// UPDATE CYCLE
// ============================================================

async function runUpdate() {
  if (updateInProgress) {
    console.log(
      "⚠️ Update already running. Skipping."
    );

    return false;
  }

  updateInProgress = true;

  let browser = null;
  let context = null;
  let page = null;

  try {
    console.log(
      "\n========================================"
    );

    console.log(
      "🛰️ ISS BIO UPDATE"
    );

    console.log(
      "========================================"
    );

    /*
     * IMPORTANT:
     *
     * Get the ISS position FIRST.
     *
     * Only after we have the current distance do we
     * start opening/loading Instagram.
     */
    let issData =
      await getFreshISSData();

    console.log(
      "\n📍 ISS distance locked for this attempt."
    );

    console.log(
      `   ${issData.formattedDistance} 𝚔𝚖`
    );

    console.log(
      "\n🌐 Starting Instagram browser..."
    );

    browser =
      await chromium.launch({
        headless: false,
      });

    context =
      await browser.newContext({
        storageState: AUTH_FILE,
      });

    page =
      await context.newPage();

    page.setDefaultTimeout(10000);

    page.setDefaultNavigationTimeout(
      30000
    );

    const errorState =
      createPageErrorState();

    installPageErrorDetection(
      page,
      errorState
    );

    for (
      let attempt = 1;
      attempt <= MAX_UPDATE_ATTEMPTS;
      attempt++
    ) {
      try {
        /*
         * For retries, refresh the ISS position
         * immediately before opening/editing Instagram.
         */
        if (attempt > 1) {
          console.log(
            "\n🛰️ Getting a fresh ISS position immediately before retry..."
          );

          issData =
            await getFreshISSData();
        }

        console.log(
          `\n🔄 Attempt ${attempt}/${MAX_UPDATE_ATTEMPTS}`
        );

        console.log(
          `📍 Using distance: ${issData.formattedDistance} 𝚔𝚖`
        );

        console.log(
          "\n📝 Target bio:"
        );

        console.log(
          "----------------------------------------"
        );

        console.log(
          buildBio(
            issData.formattedDistance
          )
        );

        console.log(
          "----------------------------------------"
        );

        await attemptInstagramUpdate(
          page,
          errorState,
          issData.formattedDistance,
          attempt
        );

        console.log(
          "\n🎉 BIO SUCCESSFULLY SAVED."
        );

        console.log(
          "⏱️ Starting 60-second timer NOW."
        );

        return true;
      } catch (error) {
        console.log(
          `\n⚠️ Attempt ${attempt}/${MAX_UPDATE_ATTEMPTS} failed: ${error.message}`
        );

        if (
          attempt >=
          MAX_UPDATE_ATTEMPTS
        ) {
          console.log(
            "🛑 Maximum attempts reached."
          );

          return false;
        }

        console.log(
          `\n⏳ Waiting ${RETRY_INTERVAL / 1000} seconds before retry...`
        );

        await sleep(
          RETRY_INTERVAL
        );
      }
    }

    return false;
  } catch (error) {
    console.error(
      "\n❌ Update cycle failed:"
    );

    console.error(
      `   ${error.message}`
    );

    return false;
  } finally {
    updateInProgress = false;

    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore browser close errors.
      }
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(
    "🚀 ISS Instagram Bio Tracker starting..."
  );

  console.log(
    "🔐 Loading saved Instagram session..."
  );

  while (true) {
    const success =
      await runUpdate();

    if (success) {
      console.log(
        "\n⏳ Waiting 60 seconds after confirmed save..."
      );

      await sleep(
        UPDATE_INTERVAL
      );
    } else {
      console.log(
        `\n🔁 Update failed. Waiting ${RETRY_INTERVAL / 1000} seconds before starting another update cycle...`
      );

      await sleep(
        RETRY_INTERVAL
      );
    }
  }
}

main().catch((error) => {
  console.error(
    "\n💥 Fatal error:"
  );

  console.error(error);

  process.exit(1);
});
