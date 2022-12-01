const form = document.getElementById("control-row");
const go = document.getElementById("go");
const input = document.getElementById("input");
const inputTargetHost = document.getElementById("current-host");
const message = document.getElementById("message");

let currentUrl;
let currentTab;

// The async IIFE is necessary because Chrome <89 does not support top level await.
(async function initPopupWindow() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  currentTab = tab;

  if (tab?.url) {
    try {
      let url = new URL(tab.url);
      currentUrl = url;
      inputTargetHost.value = url.hostname;
      input.value = "staging.signavio.com";
    } catch {}
  }

  input.focus();
})();

form.addEventListener("submit", handleFormSubmit);

async function handleFormSubmit(event) {
  event.preventDefault();

  clearMessage();

  let url = stringToUrl(input.value);
  if (!url) {
    setMessage("Invalid URL");
    return;
  }

  // 1. delete existing session cookies set by login screen
  // (they interfere with the cookies with the same name that we'll transfer from staging)
  await chrome.cookies.remove({
    name: "JSESSIONID",
    url: currentUrl.href,
  });
  await chrome.cookies.remove({
    name: "LBROUTEID",
    url: currentUrl.href,
  });
  await chrome.cookies.remove({
    name: "token",
    url: currentUrl.href,
  });
  await chrome.cookies.remove({
    name: "login",
    url: currentUrl.href,
  });
  await chrome.cookies.remove({
    name: "identifier",
    url: currentUrl.href,
  });

  // 2. transfer staging cookies to the current vercel-domain
  let message = await transferDomainCookies(url.hostname);
  setMessage(message);

  // 3. reload to the original vercel-domain + PI path to bypass login/explorer
  chrome.tabs.update(currentTab.id, {
    url: currentUrl.origin + "/g/statics/pi",
  });
}

function stringToUrl(input) {
  // Start with treating the provided value as a URL
  try {
    return new URL(input);
  } catch {}
  // If that fails, try assuming the provided input is an HTTP host
  try {
    return new URL("http://" + input);
  } catch {}
  // If that fails ¯\_(ツ)_/¯
  return null;
}

async function transferDomainCookies(domain) {
  let cookiesDeleted = 0;
  try {
    const cookies = await chrome.cookies.getAll({ domain });

    if (cookies.length === 0) {
      return "No cookies found";
    }

    let pending = cookies.map(transferCookie);
    await Promise.all(pending);

    cookiesDeleted = pending.length;
  } catch (error) {
    return `Unexpected error: ${error.message}`;
  }

  return `Transfered ${cookiesDeleted} cookie(s).`;
}

async function transferCookie(cookie) {
  const newCookie = await chrome.cookies.set({
    expirationDate: cookie.expirationDate,
    httpOnly: cookie.httpOnly,
    name: cookie.name,
    path: cookie.path,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    storeId: cookie.storeId,
    value: cookie.value,

    url: currentUrl.href,
    domain: inputTargetHost.value,
  });

  console.log(newCookie);
}

function setMessage(str) {
  message.textContent = str;
  message.hidden = false;
}

function clearMessage() {
  message.hidden = true;
  message.textContent = "";
}
