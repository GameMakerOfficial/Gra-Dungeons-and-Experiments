// ============================================================
// PIXEL RPG TYCOON - SCRIPT.JS
// ============================================================

// --- WYSOKOŚĆ EKRANU MOBILE ---
function setScreenHeight() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

window.addEventListener('resize', setScreenHeight);
setScreenHeight();

// --- DŹWIĘK GRY ---
const gameAudio = {
    context: null,
    master: null,
    musicTimer: null,
    dungeonTimer: null,
    musicStep: 0,
    muted: false,
    initialized: false,

    init() {
        if (this.initialized) {
            if (this.context && this.context.state === "suspended") this.context.resume();
            return;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.context.destination);
        this.initialized = true;
        this.startMenuMusic();
    },

    tone(frequency, duration, type = "sine", volume = 0.2, delay = 0) {
        if (!this.initialized || this.muted) return;
        const start = this.context.currentTime + delay;
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        oscillator.connect(gain);
        gain.connect(this.master);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
    },

    startMenuMusic() {
        if (!this.initialized || this.musicTimer) return;
        const melody = [261.63, 329.63, 392.00, 329.63, 293.66, 349.23, 440.00, 349.23];
        const playNote = () => {
            this.tone(melody[this.musicStep % melody.length], 0.7, "triangle", 0.07);
            this.musicStep++;
        };
        playNote();
        this.musicTimer = window.setInterval(playNote, 760);
    },

    stopMusic() {
        if (this.musicTimer) {
            clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
    },

    swordClash() {
        this.tone(170, 0.08, "sawtooth", 0.22);
        this.tone(95, 0.12, "square", 0.16, 0.07);
        this.tone(240, 0.07, "sawtooth", 0.16, 0.18);
    },

    swordFight() {
        this.stopMusic();
        this.swordClash();
    },

    startDungeonCombat() {
        this.swordFight();
        this.dungeonTimer = window.setInterval(() => this.swordClash(), 1800);
    },

    stopDungeonCombat() {
        if (this.dungeonTimer) {
            clearInterval(this.dungeonTimer);
            this.dungeonTimer = null;
        }
        this.startMenuMusic();
    },

    anvil() {
        this.tone(110, 0.12, "square", 0.22);
        this.tone(165, 0.16, "triangle", 0.16, 0.13);
        this.tone(330, 0.1, "sine", 0.1, 0.3);
    },

    success() {
        this.tone(523.25, 0.12, "triangle", 0.16);
        this.tone(659.25, 0.16, "triangle", 0.16, 0.11);
        this.tone(783.99, 0.22, "triangle", 0.16, 0.23);
    },

    failure() {
        this.tone(220, 0.18, "sawtooth", 0.16);
        this.tone(164.81, 0.28, "sawtooth", 0.14, 0.18);
    },

    toggle() {
        this.init();
        this.muted = !this.muted;
        if (this.master) this.master.gain.value = this.muted ? 0 : 0.16;
        const button = document.getElementById("audio-toggle");
        if (button) {
            button.innerText = this.muted ? "🔇" : "🔊";
            button.setAttribute("aria-label", this.muted ? "Włącz dźwięk" : "Wycisz dźwięk");
            button.title = this.muted ? "Włącz dźwięk" : "Wycisz dźwięk";
        }
    }
};

document.addEventListener("pointerdown", () => gameAudio.init(), { once: true });

// --- SCHOWANIE PASKA PRZEGLĄDARKI ---
window.addEventListener('load', () => {
    setTimeout(() => {
        window.scrollTo(0, 1);
    }, 100);
});

// --- FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDbVxlkWCzXBmsnQ5uvFpuW91Xevf2ZR54",
    authDomain: "dungeons-and-experiments.firebaseapp.com",
    projectId: "dungeons-and-experiments",
    storageBucket: "dungeons-and-experiments.firebasestorage.app",
    messagingSenderId: "104990230475",
    appId: "1:104990230475:web:58e9dcca6be7a434ded84e",
    measurementId: "G-YCS8LP95X0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- GRACZ ---
let player = {
    nickname: "",
    password: "",
    rank: "PLAYER",
    weapon: "None",
    dungeonLevel: 1,
    inventory: {
        plank: 0, stone: 0, meat: 0, metal: 0, diamond: 0, mythril: 0, upgradeItem: 0
    },
    sniperUpgradesUsed: 0,
    sniperLastRewardLevel: 0,
    rankRewardsClaimed: { OWNER: false, VIP: false, FB: false },
    clanId: "",
    globalMessageUsage: { count: 0, windowStartedAt: 0 },
    inbox: []
};

let activeTimer = null;
const deletedAccountMessage = "Konto usunięte przez administrację.\n\nWszelki kontakt na maila: gamemakeroffcialmail@gmail.com";

// --- NORMALIZACJA DANYCH STARYCH KONT ---
function normalizePlayerData() {
    if (!player.inventory) player.inventory = {};

    const defaultInventory = { plank: 0, stone: 0, meat: 0, metal: 0, diamond: 0, mythril: 0, upgradeItem: 0 };
    for (let res in defaultInventory) {
        if (typeof player.inventory[res] !== "number") {
            player.inventory[res] = defaultInventory[res];
        }
    }

    if (!player.rankRewardsClaimed) {
        player.rankRewardsClaimed = { OWNER: false, VIP: false, FB: false };
    }

    if (typeof player.rankRewardsClaimed.OWNER !== "boolean") player.rankRewardsClaimed.OWNER = false;
    if (typeof player.rankRewardsClaimed.VIP !== "boolean") player.rankRewardsClaimed.VIP = false;
    if (typeof player.rankRewardsClaimed.FB !== "boolean") player.rankRewardsClaimed.FB = false;
    if (typeof player.sniperUpgradesUsed !== "number") player.sniperUpgradesUsed = 0;
    if (typeof player.sniperLastRewardLevel !== "number") player.sniperLastRewardLevel = 0;
    if (typeof player.damageBonus !== "number") player.damageBonus = 0;
    if (typeof player.defenseBonus !== "number") player.defenseBonus = 0;
    if (typeof player.dungeonSuccessBonus !== "number") player.dungeonSuccessBonus = 0;
    if (!Array.isArray(player.inbox)) player.inbox = [];
    if (typeof player.clanId !== "string") player.clanId = "";
    if (!player.globalMessageUsage || typeof player.globalMessageUsage !== "object") {
        player.globalMessageUsage = { count: 0, windowStartedAt: 0 };
    }
    if (typeof player.globalMessageUsage.count !== "number") player.globalMessageUsage.count = 0;
    if (typeof player.globalMessageUsage.windowStartedAt !== "number") player.globalMessageUsage.windowStartedAt = 0;
}

// ============================================================
// PIXEL RPG TYCOON - SCRIPT.JS (CZĘŚĆ 2/3)
// ============================================================

// --- MODALE (OKNA POP-UP) ---
function showModal(title, content, buttons, seconds = 0, onTimerFinish = null) {
    const modal = document.getElementById("custom-modal");
    const timerElem = document.getElementById("modal-timer");
    const descElem = document.getElementById("modal-desc");
    const titleElem = document.getElementById("modal-title");
    
    if (titleElem) titleElem.innerText = title;

    if (descElem) {
        if (typeof content === "string") {
            descElem.innerText = content;
        } else {
            descElem.innerHTML = "";
            descElem.appendChild(content);
        }
    }

    let btnContainer = document.getElementById("modal-buttons");
    if (btnContainer) btnContainer.innerHTML = "";

    if (activeTimer) {
        clearInterval(activeTimer);
        activeTimer = null;
    }

    if (seconds > 0 && timerElem) {
        timerElem.style.display = "block";
        timerElem.innerText = seconds + "s";
        let timeLeft = seconds;

        activeTimer = setInterval(() => {
            timeLeft--;
            timerElem.innerText = timeLeft + "s";
            if (timeLeft <= 0) {
                clearInterval(activeTimer);
                activeTimer = null;
                timerElem.style.display = "none";
                if (onTimerFinish) onTimerFinish();
            }
        }, 1000);
    } else if (timerElem) {
        timerElem.style.display = "none";
    }

    if (btnContainer) {
        buttons.forEach(btn => {
            let newBtn = document.createElement("button");
            newBtn.className = "btn";
            newBtn.innerText = btn.text;
            if (btn.color) newBtn.style.background = btn.color;
            
            newBtn.onclick = () => {
                closeModal();
                if (btn.action) btn.action();
            };
            btnContainer.appendChild(newBtn);
        });
    }

    if (modal) modal.classList.add("active");
}

function closeModal() {
    if (activeTimer) {
        clearInterval(activeTimer);
        activeTimer = null;
    }
    const modal = document.getElementById("custom-modal");
    if (modal) modal.classList.remove("active");
}

function saveProgress() {
    if (!player.nickname) return Promise.resolve();
    return db.collection("users").doc(player.nickname).set(player, { merge: true });
}

function createModalButton(text, action, color = "#4CAF50") {
    const button = document.createElement("button");
    button.className = "slot-action";
    button.innerText = text;
    button.style.background = color;
    button.addEventListener("click", action);
    return button;
}

function openInventory() {
    normalizePlayerData();

    const content = document.createElement("div");
    content.innerHTML = `
        <div class="modal-tabs">
            <button class="modal-tab active" type="button">EQ</button>
            <button class="modal-tab" type="button">STATYSTYKI</button>
        </div>
        <div class="modal-section-title">WYPOSAŻENIE</div>
        <div class="modal-grid" id="equipment-slots"></div>
        <div class="modal-section-title">PLECAK - SUROWCE</div>
        <div class="modal-grid" id="resource-slots"></div>
        <div class="modal-section-title">STATYSTYKI POSTACI</div>
        <div class="stat-row"><span>OBRAŻENIA</span><strong id="stat-damage">0</strong></div>
        <div class="stat-row"><span>OBRONA</span><strong id="stat-defense">0</strong></div>
    `;

    const equipmentSlots = content.querySelector("#equipment-slots");
    [
        { label: "BROŃ", value: player.weapon || "Brak", action: "ZAŁÓŻ" },
        { label: "PANCERZ", value: player.armor || "Brak", action: "ZAŁÓŻ" },
        { label: "AKCESORIA", value: player.accessory || "Brak", action: "ZAŁÓŻ" }
    ].forEach(item => {
        const slot = document.createElement("div");
        slot.className = "inventory-slot";
        slot.innerHTML = `<strong>${item.label}</strong><span>${item.value}</span>`;
        if (item.value !== "Brak") {
            slot.appendChild(createModalButton(item.action, () => showModal("WYPOSAŻONO", `${item.value} jest teraz aktywne.`, [{ text: "OK" }])));
        }
        equipmentSlots.appendChild(slot);
    });

    const resourceSlots = content.querySelector("#resource-slots");
    const resources = [
        ["PLANK", "plank", "UŻYJ"], ["STONE", "stone", "UŻYJ"], ["MEAT", "meat", "ZJEDZ"],
        ["METAL", "metal", "UŻYJ"], ["DIAM", "diamond", "UŻYJ"], ["MYTH", "mythril", "UŻYJ"]
    ];
    resources.forEach(([label, key, actionLabel]) => {
        const slot = document.createElement("div");
        slot.className = "inventory-slot";
        slot.innerHTML = `<strong>${label}</strong><span id="resource-${key}">${player.inventory[key]}</span>`;
        slot.appendChild(createModalButton(actionLabel, () => useInventoryResource(key, label), "#8B5A2B"));
        resourceSlots.appendChild(slot);
    });

    const damage = (player.weapon && player.weapon !== "None" ? 10 : 0) + player.damageBonus;
    content.querySelector("#stat-damage").innerText = damage;
    content.querySelector("#stat-defense").innerText = (player.armor ? 5 : 0) + player.defenseBonus;

    showModal("EKWIPUNEK", content, [{ text: "ZAMKNIJ", color: "#777" }]);
}

function useInventoryResource(resourceKey, label) {
    normalizePlayerData();
    if (player.inventory[resourceKey] <= 0) {
        return showModal("PUSTY SLOT", `Nie masz surowca: ${label}.`, [{ text: "OK", color: "#777" }]);
    }
    player.inventory[resourceKey]--;
    updateUI();
    saveProgress().catch(error => console.error("Błąd zapisu ekwipunku:", error));
    showModal("UŻYTO PRZEDMIOTU", `${label} został użyty.`, [{ text: "OK" }]);
}

function getClanIdForNickname(nickname) {
    return String(nickname || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatSocialDate(timestamp) {
    if (!timestamp) return "teraz";
    const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "teraz";
    return date.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function getVipMessageUsage() {
    normalizePlayerData();
    const now = Date.now();
    const fiveHours = 5 * 60 * 60 * 1000;
    if (now - player.globalMessageUsage.windowStartedAt >= fiveHours) {
        player.globalMessageUsage = { count: 0, windowStartedAt: now };
    }
    return player.globalMessageUsage;
}

function createSocialRow(title, description) {
    const row = document.createElement("div");
    row.className = "friend-row";
    const titleElement = document.createElement("span");
    titleElement.textContent = title;
    const descriptionElement = document.createElement("strong");
    descriptionElement.textContent = description;
    row.append(titleElement, descriptionElement);
    return row;
}

async function loadGlobalMessages(container) {
    container.textContent = "ŁADOWANIE WIADOMOŚCI...";
    try {
        const snapshot = await db.collection("globalMessages").orderBy("createdAt", "desc").limit(50).get();
        container.innerHTML = "";
        if (snapshot.empty) {
            container.textContent = "Brak wiadomości globalnych.";
            return;
        }
        snapshot.forEach(doc => {
            const message = doc.data();
            const card = document.createElement("div");
            card.className = "lab-card";
            const heading = document.createElement("strong");
            heading.textContent = `${message.author || "Gracz"} [${message.rank || "PLAYER"}]`;
            const body = document.createElement("span");
            body.textContent = message.text || "";
            const date = document.createElement("small");
            date.textContent = formatSocialDate(message.createdAt);
            card.append(heading, body, date);
            container.appendChild(card);
        });
    } catch (error) {
        console.error("Błąd pobierania wiadomości globalnych:", error);
        container.textContent = "Nie udało się pobrać wiadomości globalnych.";
    }
}

async function loadClans(container) {
    container.textContent = "ŁADOWANIE KLANÓW...";
    try {
        const snapshot = await db.collection("clans").limit(100).get();
        container.innerHTML = "";
        if (snapshot.empty) {
            container.textContent = "Brak klanów. Utwórz pierwszy klan.";
            return;
        }
        snapshot.forEach(doc => {
            const clan = doc.data();
            const card = document.createElement("div");
            card.className = "lab-card";
            const title = document.createElement("strong");
            title.textContent = clan.name || "Klan bez nazwy";
            const description = document.createElement("span");
            description.textContent = `${clan.description || "Brak opisu"} | Właściciel: ${clan.ownerNickname || "?"}`;
            const status = document.createElement("span");
            status.className = "lab-cost";
            status.textContent = clan.joinMode === "open" ? "DOŁĄCZENIE: OTWARTE" : "DOŁĄCZENIE: WYMAGA ZGODY";
            card.append(title, description, status);

            const isMember = Array.isArray(clan.memberNicknames) && clan.memberNicknames.includes(player.nickname);
            const hasRequest = Array.isArray(clan.pendingRequests) && clan.pendingRequests.some(request => request.nickname === player.nickname);
            if (isMember && player.clanId !== doc.id) {
                player.clanId = doc.id;
                saveProgress().catch(error => console.error("Błąd zapisu członkostwa w klanie:", error));
            }
            if (clan.ownerNickname === player.nickname) {
                (clan.pendingRequests || []).forEach(request => {
                    const requestButton = createModalButton(`AKCEPTUJ ${request.nickname}`, async () => {
                        await db.collection("clans").doc(doc.id).update({
                            memberNicknames: firebase.firestore.FieldValue.arrayUnion(request.nickname),
                            pendingRequests: firebase.firestore.FieldValue.arrayRemove(request)
                        });
                        loadClans(container);
                    }, "#2196F3");
                    card.appendChild(requestButton);
                });
            } else if (isMember) {
                card.appendChild(createModalButton("JUŻ NALEŻYSZ", () => {}, "#777"));
            } else if (player.clanId) {
                card.appendChild(createModalButton("NALEŻYSZ DO INNEGO KLANU", () => {}, "#777"));
            } else if (hasRequest) {
                card.appendChild(createModalButton("PROŚBA WYSŁANA", () => {}, "#777"));
            } else {
                card.appendChild(createModalButton(clan.joinMode === "open" ? "DOŁĄCZ" : "WYŚLIJ PROŚBĘ", async () => {
                    const update = clan.joinMode === "open"
                        ? { memberNicknames: firebase.firestore.FieldValue.arrayUnion(player.nickname) }
                        : { pendingRequests: firebase.firestore.FieldValue.arrayUnion({ nickname: player.nickname, level: player.dungeonLevel }) };
                    await db.collection("clans").doc(doc.id).update(update);
                    if (clan.joinMode === "open") {
                        player.clanId = doc.id;
                        await saveProgress();
                    }
                    loadClans(container);
                }, "#4CAF50"));
            }
            container.appendChild(card);
        });
    } catch (error) {
        console.error("Błąd pobierania klanów:", error);
        container.textContent = "Nie udało się pobrać klanów.";
    }
}

async function loadOwnerAccounts(container) {
    container.textContent = "ŁADOWANIE KONT...";
    try {
        const snapshot = await db.collection("users").limit(200).get();
        container.innerHTML = "";
        if (snapshot.empty) {
            container.textContent = "Brak kont.";
            return;
        }

        snapshot.forEach(doc => {
            const account = doc.data();
            const card = document.createElement("div");
            card.className = "lab-card";
            const heading = document.createElement("strong");
            heading.textContent = `${account.nickname || doc.id} [${account.rank || "PLAYER"}]`;
            card.appendChild(heading);

            if (doc.id === player.nickname) {
                const ownAccount = document.createElement("span");
                ownAccount.textContent = "To jest Twoje konto OWNER.";
                card.appendChild(ownAccount);
                container.appendChild(card);
                return;
            }

            if (account.accountDeleted === true) {
                const deletedLabel = document.createElement("span");
                deletedLabel.textContent = "KONTO USUNIĘTE PRZEZ ADMINISTRACJĘ";
                card.appendChild(deletedLabel);
                const restoreButton = createModalButton("PRZYWRÓĆ KONTO", async () => {
                    try {
                        await db.collection("users").doc(doc.id).update({
                            accountDeleted: false,
                            deletedAt: firebase.firestore.FieldValue.delete(),
                            deletedBy: firebase.firestore.FieldValue.delete()
                        });
                        await db.collection("deletedAccounts").doc(doc.id).delete().catch(() => {});
                        loadOwnerAccounts(container);
                    } catch (error) {
                        console.error("Błąd przywracania konta:", error);
                        showModal("BŁĄD", "Nie udało się przywrócić konta.", [{ text: "OK", color: "#f44336" }]);
                    }
                }, "#4CAF50");
                card.appendChild(restoreButton);
                container.appendChild(card);
                return;
            }

            const newNameInput = document.createElement("input");
            newNameInput.className = "modal-input";
            newNameInput.type = "text";
            newNameInput.maxLength = 30;
            newNameInput.placeholder = "NOWA NAZWA KONTA";
            const newPasswordInput = document.createElement("input");
            newPasswordInput.className = "modal-input";
            newPasswordInput.type = "password";
            newPasswordInput.maxLength = 30;
            newPasswordInput.placeholder = "NOWE HASŁO";
            const renameButton = createModalButton("ZMIEŃ NAZWĘ", async () => {
                const newName = newNameInput.value.trim();
                if (!newName) return showModal("BRAK NAZWY", "Wpisz nową nazwę konta.", [{ text: "OK", color: "#f44336" }]);
                if (newName.includes("/")) return showModal("NIEPOPRAWNA NAZWA", "Nazwa konta nie może zawierać znaku /.", [{ text: "OK", color: "#f44336" }]);
                if (newName === doc.id) return showModal("TAKA SAMA NAZWA", "Wybierz inną nazwę konta.", [{ text: "OK", color: "#f44336" }]);
                const newDoc = db.collection("users").doc(newName);
                if ((await newDoc.get()).exists) return showModal("NAZWA ZAJĘTA", "Konto o tej nazwie już istnieje.", [{ text: "OK", color: "#f44336" }]);
                if ((await db.collection("deletedAccounts").doc(newName).get()).exists) return showModal("NAZWA ZABLOKOWANA", deletedAccountMessage, [{ text: "OK", color: "#f44336" }]);
                const updatedAccount = { ...account, nickname: newName };
                await newDoc.set(updatedAccount);
                await db.collection("users").doc(doc.id).delete();
                await updateClanAccountReferences(doc.id, newName);
                await updateFriendAccountReferences(doc.id, newName);
                loadOwnerAccounts(container);
            }, "#2196F3");
            const passwordButton = createModalButton("ZMIEŃ HASŁO", async () => {
                const newPassword = newPasswordInput.value.trim();
                if (!newPassword) return showModal("BRAK HASŁA", "Wpisz nowe hasło konta.", [{ text: "OK", color: "#f44336" }]);
                await db.collection("users").doc(doc.id).update({ password: newPassword });
                newPasswordInput.value = "";
                showModal("HASŁO ZMIENIONE", `Hasło konta ${doc.id} zostało zmienione.`, [{ text: "OK" }]);
            }, "#FF9800");
            const deleteButton = createModalButton("USUŃ KONTO", async () => {
                if (!window.confirm(`Czy na pewno usunąć konto ${doc.id}?`)) return;
                try {
                    await db.collection("users").doc(doc.id).update({ accountDeleted: true, deletedAt: firebase.firestore.FieldValue.serverTimestamp(), deletedBy: player.nickname });
                    await db.collection("deletedAccounts").doc(doc.id).set({ nickname: doc.id, deletedAt: firebase.firestore.FieldValue.serverTimestamp(), deletedBy: player.nickname }).catch(error => console.warn("Nie udało się zapisać znacznika deletedAccounts:", error));
                    await updateClanAccountReferences(doc.id, null);
                    await updateFriendAccountReferences(doc.id, null);
                    loadOwnerAccounts(container);
                } catch (error) {
                    console.error("Błąd usuwania konta:", error);
                    showModal("BŁĄD USUWANIA", "Nie udało się usunąć konta. Sprawdź reguły Firebase.", [{ text: "OK", color: "#f44336" }]);
                }
            }, "#f44336");
            card.append(newNameInput, newPasswordInput, renameButton, passwordButton, deleteButton);
            container.appendChild(card);
        });
    } catch (error) {
        console.error("Błąd zarządzania kontami:", error);
        container.textContent = "Nie udało się pobrać kont.";
    }
}

async function updateClanAccountReferences(oldNickname, newNickname) {
    const snapshot = await db.collection("clans").limit(200).get();
    const updates = [];
    snapshot.forEach(doc => {
        const clan = doc.data();
        const members = Array.isArray(clan.memberNicknames) ? clan.memberNicknames : [];
        const requests = Array.isArray(clan.pendingRequests) ? clan.pendingRequests : [];
        const ownerNickname = clan.ownerNickname === oldNickname && newNickname ? newNickname : clan.ownerNickname;
        const updatedMembers = newNickname
            ? members.map(nickname => nickname === oldNickname ? newNickname : nickname)
            : members.filter(nickname => nickname !== oldNickname);
        const updatedRequests = requests
            .map(request => newNickname && request.nickname === oldNickname ? { ...request, nickname: newNickname } : request)
            .filter(request => request.nickname !== oldNickname);
        if (ownerNickname !== clan.ownerNickname || JSON.stringify(members) !== JSON.stringify(updatedMembers) || JSON.stringify(requests) !== JSON.stringify(updatedRequests)) {
            updates.push(doc.ref.update({ ownerNickname, memberNicknames: updatedMembers, pendingRequests: updatedRequests }));
        }
    });
    await Promise.all(updates);
}

async function updateFriendAccountReferences(oldNickname, newNickname) {
    const snapshot = await db.collection("users").limit(200).get();
    const updates = [];
    snapshot.forEach(doc => {
        const account = doc.data();
        const friends = Array.isArray(account.friends) ? account.friends : [];
        const updatedFriends = newNickname
            ? friends.map(friend => friend.nickname === oldNickname ? { ...friend, nickname: newNickname } : friend)
            : friends.filter(friend => friend.nickname !== oldNickname);
        if (JSON.stringify(friends) !== JSON.stringify(updatedFriends)) updates.push(doc.ref.update({ friends: updatedFriends }));
    });
    await Promise.all(updates);
}

function openSocial() {
    normalizePlayerData();
    const content = document.createElement("div");
    content.innerHTML = `
        <div class="modal-tabs social-tabs">
            <button class="modal-tab active" type="button" data-section="guild">ZNAJOMI</button>
            <button class="modal-tab" type="button" data-section="clans">KLANY</button>
            <button class="modal-tab" type="button" data-section="messages">WIADOMOŚCI GLOBALNE</button>
            <button class="modal-tab" type="button" data-section="profile">PROFIL</button>
            ${player.rank === "OWNER" ? '<button class="modal-tab" type="button" data-section="admin">KONTA</button>' : ""}
        </div>
        <div id="social-guild">
            <div class="modal-section-title">RANGA</div>
            <div class="profile-row"><span>${player.rank || "PLAYER"}</span><strong>${player.nickname || "Gracz"}</strong></div>
            <div class="modal-section-title">ZNAJOMI</div>
            <div id="friends-list"></div>
            <input class="modal-input" id="friend-nickname" type="text" placeholder="NICK ZNAJOMEGO" maxlength="30">
            <button class="slot-action" id="add-friend" type="button">DODAJ ZNAJOMEGO</button>
        </div>
        <div id="social-clans" style="display:none">
            <div class="modal-section-title">TWÓJ KLAN</div>
            <div id="my-clan-info"></div>
            <div class="modal-section-title">DOSTĘPNE KLANY</div>
            <div id="clans-list"></div>
            <div class="modal-section-title">UTWÓRZ KLAN</div>
            <input class="modal-input" id="clan-name" type="text" placeholder="NAZWA KLANU" maxlength="30">
            <input class="modal-input" id="clan-description" type="text" placeholder="OPIS KLANU" maxlength="120">
            <select class="modal-input" id="clan-join-mode">
                <option value="open">DOŁĄCZENIE OTWARTE</option>
                <option value="request">WYMAGA PROŚBY</option>
            </select>
            <button class="slot-action" id="create-clan" type="button">UTWÓRZ KLAN</button>
        </div>
        <div id="social-messages" style="display:none">
            <div class="modal-section-title">WIADOMOŚCI GLOBALNE</div>
            <div id="global-messages-list"></div>
            <div id="global-message-form"></div>
        </div>
        <div id="social-profile" style="display:none">
            <div class="modal-section-title">PROFIL GRACZA</div>
            <div class="profile-row"><span>ID</span><strong>${player.nickname || "Nieznany"}</strong></div>
            <div class="profile-row"><span>POZIOM LOCHU</span><strong>${player.dungeonLevel}</strong></div>
            <button class="slot-action" id="copy-player-id" type="button">KOPIUJ SWOJE ID</button>
        </div>
        ${player.rank === "OWNER" ? '<div id="social-admin" style="display:none"><div class="modal-section-title">ZARZĄDZANIE KONTAMI</div><div class="lab-cost">Możesz zmienić nazwę, hasło albo usunąć konto innego gracza.</div><div id="owner-accounts-list"></div></div>' : ""}
    `;

    const friends = Array.isArray(player.friends) ? player.friends : [];
    const friendsList = content.querySelector("#friends-list");
    if (friends.length === 0) friendsList.textContent = "Brak znajomych";
    friends.forEach(friend => friendsList.appendChild(createSocialRow(`${friend.nickname || "Gracz"} LVL ${friend.level || 1}`, friend.online ? "ONLINE" : "OFFLINE")));

    const myClanInfo = content.querySelector("#my-clan-info");
    myClanInfo.textContent = player.clanId ? `Należysz do klanu: ${player.clanId}` : "Nie należysz jeszcze do klanu.";
    loadClans(content.querySelector("#clans-list"));

    const messageForm = content.querySelector("#global-message-form");
    if (player.rank === "OWNER" || player.rank === "VIP") {
        const usageText = player.rank === "OWNER" ? "OWNER: wiadomości bez limitu" : `VIP: ${Math.max(0, 2 - getVipMessageUsage().count)} z 2 wiadomości dostępnych w bieżących 5 godzinach`;
        messageForm.innerHTML = `<div class="lab-cost">${usageText}</div><input class="modal-input" id="global-message-text" type="text" placeholder="TREŚĆ WIADOMOŚCI" maxlength="240"><button class="slot-action" id="send-global-message" type="button">WYŚLIJ WIADOMOŚĆ</button>`;
        messageForm.querySelector("#send-global-message").addEventListener("click", async () => {
            const text = messageForm.querySelector("#global-message-text").value.trim();
            if (!text) return showModal("PUSTA WIADOMOŚĆ", "Wpisz treść wiadomości.", [{ text: "OK", color: "#f44336" }]);
            const usage = getVipMessageUsage();
            if (player.rank === "VIP" && usage.count >= 2) return showModal("LIMIT VIP", "Wykorzystałeś 2 wiadomości. Limit odnowi się po 5 godzinach.", [{ text: "OK", color: "#f44336" }]);
            await db.collection("globalMessages").add({ author: player.nickname, rank: player.rank, text, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            if (player.rank === "VIP") player.globalMessageUsage.count++;
            await saveProgress();
            openSocial();
        });
    } else {
        messageForm.textContent = "Wiadomości globalne mogą wysyłać tylko rangi OWNER i VIP.";
    }
    loadGlobalMessages(content.querySelector("#global-messages-list"));
    if (player.rank === "OWNER") loadOwnerAccounts(content.querySelector("#owner-accounts-list"));

    content.querySelector("#create-clan").addEventListener("click", async () => {
        const name = content.querySelector("#clan-name").value.trim();
        const description = content.querySelector("#clan-description").value.trim();
        const joinMode = content.querySelector("#clan-join-mode").value;
        if (!name) return showModal("BRAK NAZWY", "Podaj nazwę klanu.", [{ text: "OK", color: "#f44336" }]);
        if (player.clanId) return showModal("JUŻ MASZ KLAN", "Najpierw opuść obecny klan.", [{ text: "OK", color: "#f44336" }]);
        const clanRef = db.collection("clans").doc(`${getClanIdForNickname(name)}-${Date.now()}`);
        await clanRef.set({ name, description, joinMode, ownerNickname: player.nickname, memberNicknames: [player.nickname], pendingRequests: [], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        player.clanId = clanRef.id;
        await saveProgress();
        openSocial();
    });

    content.querySelector("#add-friend").addEventListener("click", async () => {
        const nickname = content.querySelector("#friend-nickname").value.trim();
        if (!nickname) return showModal("BRAK NICKU", "Wpisz nick znajomego.", [{ text: "OK", color: "#f44336" }]);
        if (nickname === player.nickname) return showModal("NIEPOPRAWNY NICK", "Nie możesz dodać siebie.", [{ text: "OK", color: "#f44336" }]);
        const friendSnapshot = await db.collection("users").doc(nickname).get();
        if (!friendSnapshot.exists || friendSnapshot.data().accountDeleted === true) return showModal("KONTO NIEDOSTĘPNE", "Nie można znaleźć tego konta.", [{ text: "OK", color: "#f44336" }]);
        player.friends = friends;
        player.friends.push({ nickname, level: 1, online: false });
        saveProgress().catch(error => console.error("Błąd zapisu znajomych:", error));
        openSocial();
    });

    content.querySelector("#copy-player-id").addEventListener("click", copyPlayerId);
    content.querySelectorAll(".modal-tab").forEach(tab => tab.addEventListener("click", () => {
        content.querySelectorAll(".modal-tab").forEach(item => item.classList.remove("active"));
        tab.classList.add("active");
        ["guild", "clans", "messages", "profile", "admin"].forEach(section => {
            const sectionElement = content.querySelector(`#social-${section}`);
            if (sectionElement) sectionElement.style.display = tab.dataset.section === section ? "block" : "none";
        });
    }));
    showModal("SPOŁECZNOŚĆ", content, [{ text: "ZAMKNIJ", color: "#777" }]);
}

function copyPlayerId() {
    const playerId = player.nickname || "unknown";
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(playerId)
            .then(() => showModal("SKOPIOWANO", `Twoje ID: ${playerId}`, [{ text: "OK" }]))
            .catch(() => showModal("TWOJE ID", playerId, [{ text: "OK" }]));
    } else {
        const fallbackInput = document.createElement("textarea");
        fallbackInput.value = playerId;
        fallbackInput.style.position = "fixed";
        fallbackInput.style.opacity = "0";
        document.body.appendChild(fallbackInput);
        fallbackInput.select();
        let copied = false;
        try {
            copied = document.execCommand("copy");
        } catch (error) {
            copied = false;
        }
        fallbackInput.remove();
        showModal(copied ? "SKOPIOWANO" : "TWOJE ID", playerId, [{ text: "OK" }]);
    }
}

// --- AKTUALIZACJA WIDOKU (UI) ---
function updateUI() {
    normalizePlayerData();

    const setElemText = (id, text) => {
        const elem = document.getElementById(id);
        if (elem) elem.innerText = text;
    };

    setElemText('ui-nick', player.nickname);
    setElemText('ui-rank', "[" + player.rank + "]");
    setElemText('ui-weapon', player.weapon);
    setElemText('dungeon-lvl-display', player.dungeonLevel);

    setElemText('res-plank', player.inventory.plank);
    setElemText('res-stone', player.inventory.stone);
    setElemText('res-meat', player.inventory.meat);
    setElemText('res-metal', player.inventory.metal);
    setElemText('res-diamond', player.inventory.diamond);
    setElemText('res-mythril', player.inventory.mythril);

    const upgradeUI = document.getElementById("upgrade-resource-ui");
    if (upgradeUI) {
        if (player.rank === "SNAJPER") {
            upgradeUI.style.display = "inline";
            setElemText("res-upgrade", player.inventory.upgradeItem);
        } else {
            upgradeUI.style.display = "none";
        }
    }
}

// --- MNOŻNIKI I BONUSY ---
function grantRankReward() {
    normalizePlayerData();
    if (player.rank === "OWNER" && !player.rankRewardsClaimed.OWNER) {
        player.inventory.mythril += 1;
        player.rankRewardsClaimed.OWNER = true;
        return "👑 OWNER BONUS!\n\n+1 Mythril 🔮\n\nDarmowy Mythril otrzymujesz tylko raz.";
    }
    if (player.rank === "VIP" && !player.rankRewardsClaimed.VIP) {
        player.inventory.diamond += 1;
        player.rankRewardsClaimed.VIP = true;
        return "💎 VIP BONUS!\n\n+1 Diamond 💎\n\nDarmowy Diamond otrzymujesz tylko raz.";
    }
    if (player.rank === "FB" && !player.rankRewardsClaimed.FB) {
        player.inventory.metal += 1;
        player.inventory.plank += 1;
        player.rankRewardsClaimed.FB = true;
        return "⭐ FIRST PLAYER BONUS!\n\n+1 Metal ⚙️\n+1 Plank 🪵\n\nDarmowe materiały otrzymujesz tylko raz.";
    }
    return null;
}

function getDungeonTime() {
    if (player.rank === "OWNER") return 5;
    if (player.rank === "VIP") return 10;
    if (player.rank === "FB") return 20;
    return 30;
}

function getDropMultiplier() {
    if (player.rank === "OWNER") return 2.0;
    if (player.rank === "VIP") return 1.5;
    return 1.0;
}

function getLabMultiplier() {
    if (player.rank === "OWNER") return 2.0;
    if (player.rank === "VIP") return 1.5;
    return 1.0;
}

function getSniperLabPenalty() {
    return (player.rank === "SNAJPER") ? -5 : 0;
}

function getDungeonRankMultiplier() {
    if (player.rank === "OWNER") return 2.0;
    if (player.rank === "VIP") return 1.5;
    if (player.rank === "SNAJPER") return 3.0;
    return 1.0;
}

function getDungeonSuccessChance() {
    return Math.min(95, 50 + getDungeonRankMultiplier() * 10 + getSniperUpgradeBonus() + player.dungeonSuccessBonus);
}

function getSniperUpgradeBonus() {
    return (player.rank === "SNAJPER") ? player.sniperUpgradesUsed : 0;
}

function checkSniperMilestoneReward() {
    if (player.rank !== "SNAJPER") return 0;
    normalizePlayerData();
    
    const reachedMilestones = Math.floor(player.dungeonLevel / 20);
    const claimedMilestones = Math.floor(player.sniperLastRewardLevel / 20);
    const newRewards = reachedMilestones - claimedMilestones;

    if (newRewards <= 0) return 0;
    
    player.inventory.upgradeItem += newRewards;
    player.sniperLastRewardLevel = reachedMilestones * 20;
    return newRewards;
}

function useSniperUpgrade() {
    if (player.rank !== "SNAJPER") {
        return showModal("BRAK DOSTĘPU", "Upgrade Item jest dostępny wyłącznie dla rangi SNAJPER.", [{ text: "OK", color: "#f44336" }]);
    }
    if (player.inventory.upgradeItem <= 0) {
        return showModal("BRAK UPGRADE ITEM", "Nie posiadasz żadnego Upgrade Item.\n\nOtrzymasz +1 Upgrade Item za każde 20 poziomów lochu.", [{ text: "OK", color: "#777" }]);
    }

    player.inventory.upgradeItem--;
    player.sniperUpgradesUsed++;
    updateUI();
    saveProgress();

    showModal("🔼 UPGRADE!", `Upgrade Item został wykorzystany!\n\n+1% do szansy sukcesu w LOCHU.\n\nBonus z Upgrade Itemów: +${player.sniperUpgradesUsed}%`, [{ text: "SUPER", color: "#4CAF50" }]);
}

// --- LOKACJE GRY ---
function openLab() {
    normalizePlayerData();
    const content = document.createElement("div");
    content.innerHTML = `
        <div class="modal-section-title">LABORATORIUM X${getLabMultiplier()}</div>
        <div class="profile-row"><span>OBRAŻENIA</span><strong>${(player.weapon && player.weapon !== "None" ? 10 : 0) + player.damageBonus}</strong></div>
        <div class="profile-row"><span>OBRONA</span><strong>${(player.armor ? 5 : 0) + player.defenseBonus}</strong></div>
        <div class="profile-row"><span>SZANSA LOCHU</span><strong>${getDungeonSuccessChance()}%</strong></div>
        <div class="modal-section-title">ULEPSZENIA I CRAFTING</div>
        <div id="lab-upgrades"></div>
    `;

    const upgrades = [
        {
            id: "weapon",
            title: "ULEPSZ BROŃ (+5 DMG)",
            description: "Wzmocnij broń albo stwórz Stone Sword.",
            cost: { plank: 1, stone: 3, metal: 2 }
        },
        {
            id: "armor",
            title: "WZMOCNIJ PANCERZ (+2 DEF)",
            description: "Dodaje ochronę i tworzy Leather Armor.",
            cost: { plank: 3, metal: 2, meat: 1 }
        },
        {
            id: "dungeon",
            title: "ZWIĘKSZ SZANSĘ LOCHU (+5%)",
            description: "Trwały bonus do szansy powodzenia wyprawy.",
            cost: { stone: 2, diamond: 1 }
        }
    ];

    const upgradesContainer = content.querySelector("#lab-upgrades");
    upgrades.forEach(upgrade => {
        const card = document.createElement("div");
        card.className = "lab-card";
        const costText = Object.entries(upgrade.cost)
            .map(([resource, amount]) => `${resource.toUpperCase()}: ${amount}`)
            .join(" | ");
        card.innerHTML = `<strong>${upgrade.title}</strong><span>${upgrade.description}</span><span class="lab-cost">KOSZT: ${costText}</span>`;
        card.appendChild(createModalButton("KUP ULEPSZENIE", () => purchaseLabUpgrade(upgrade), "#4CAF50"));
        upgradesContainer.appendChild(card);
    });

    showModal("LABORATORIUM", content, [{ text: "ZAMKNIJ", color: "#777" }]);
}

function purchaseLabUpgrade(upgrade) {
    normalizePlayerData();
    const missingResource = Object.entries(upgrade.cost).find(([resource, amount]) => player.inventory[resource] < amount);
    if (missingResource) {
        return showModal("BRAK SUROWCÓW", `Brakuje: ${missingResource[0].toUpperCase()} (${missingResource[1]}).`, [{ text: "OK", color: "#f44336" }]);
    }

    Object.entries(upgrade.cost).forEach(([resource, amount]) => {
        player.inventory[resource] -= amount;
    });

    if (upgrade.id === "weapon") {
        if (!player.weapon || player.weapon === "None") player.weapon = "Stone Sword";
        player.damageBonus += 5;
    } else if (upgrade.id === "armor") {
        if (!player.armor) player.armor = "Leather Armor";
        player.defenseBonus += 2;
    } else if (upgrade.id === "dungeon") {
        player.dungeonSuccessBonus += 5;
    }

    gameAudio.anvil();
    updateUI();
    saveProgress().catch(() => {
        showModal("BŁĄD ZAPISU", "Ulepszenie działa lokalnie, ale nie udało się zapisać go w chmurze.", [{ text: "OK", color: "#f44336" }]);
    });
    openLab();
}

async function showLeaderboard() {
    const currentName = player.nickname || "GameMakerOfficial";
    const botNames = new Set(["dungeonking", "pixelknight", "shadowminer", "mythhunter"]);
    const isBot = user => user.isBot === true || botNames.has(String(user.nickname || "").toLowerCase()) || /^adventurer\d+$/i.test(user.nickname || "");
    let ranking = [];

    showModal("RANKING", "Ładowanie prawdziwych graczy...", []);
    try {
        const snapshot = await db.collection("users").orderBy("dungeonLevel", "desc").limit(100).get();
        ranking = snapshot.docs
            .map(doc => doc.data())
            .filter(user => user.nickname && user.accountDeleted !== true && !isBot(user))
            .map(user => ({
                nickname: user.nickname,
                rank: user.rank || "PLAYER",
                level: Number(user.dungeonLevel) || 1,
                monsters: Number(user.monstersDefeated) || (Number(user.dungeonLevel) || 1) * 10,
                resources: user.inventory ? Object.values(user.inventory).reduce((sum, value) => sum + (Number(value) || 0), 0) : 0
            }))
            .sort((first, second) => second.level - first.level || second.monsters - first.monsters)
            .slice(0, 100);
    } catch (error) {
        console.warn("Nie udało się pobrać rankingu z Firebase:", error);
    }

    if (!isBot(player) && !ranking.some(entry => entry.nickname === currentName)) {
        ranking.push({
            nickname: currentName,
            rank: player.rank || "PLAYER",
            level: Number(player.dungeonLevel) || 1,
            monsters: Number(player.monstersDefeated) || (Number(player.dungeonLevel) || 1) * 10,
            resources: Object.values(player.inventory || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
        });
        ranking.sort((first, second) => second.level - first.level || second.monsters - first.monsters);
        ranking = ranking.slice(0, 100);
    }

    const content = document.createElement("div");
    content.innerHTML = `
        <div class="modal-section-title">TOP 100 - POZIOM LOCHU</div>
        <table class="ranking-table">
            <thead><tr><th>#</th><th>GRACZ</th><th>LVL</th><th>POTWORY</th></tr></thead>
            <tbody></tbody>
        </table>
    `;
    const tbody = content.querySelector("tbody");
    if (ranking.length === 0) {
        const emptyRow = document.createElement("tr");
        const emptyCell = document.createElement("td");
        emptyCell.colSpan = 4;
        emptyCell.textContent = "Brak prawdziwych graczy w rankingu.";
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
    }
    ranking.forEach((entry, index) => {
        const row = document.createElement("tr");
        const isCurrent = entry.nickname === currentName;
        if (isCurrent) row.className = "current-player";
        [index + 1, `${entry.nickname} [${entry.rank}]`, entry.level, entry.monsters].forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });
        tbody.appendChild(row);
    });

    showModal("RANKING", content, [{ text: "ZAMKNIJ", color: "#777" }]);
}

function enterDungeon() {
    const dungeonTime = getDungeonTime();
    showModal(
        "LOCH",
        `Wchodzisz do lochu poziomu ${player.dungeonLevel}.\n\nSzansa sukcesu: ${getDungeonSuccessChance()}%.`,
        [
            { text: "ANULUJ", color: "#777" },
            {
                text: "WEJDŹ",
                color: "#4CAF50",
                action: () => {
                    gameAudio.startDungeonCombat();
                    showModal(
                        "WYPRAWA",
                        "Bohater przeszukuje loch...",
                        [],
                        dungeonTime,
                        () => {
                            gameAudio.stopDungeonCombat();
                            const successChance = getDungeonSuccessChance();
                            const success = Math.random() * 100 < successChance;

                            if (success) {
                                gameAudio.success();
                                player.dungeonLevel++;
                                const reward = Math.max(1, Math.round(getDropMultiplier()));
                                player.inventory.stone += reward;
                                player.inventory.meat += 1;
                                const newUpgradeItems = checkSniperMilestoneReward();
                                updateUI();
                                showModal(
                                    "SUKCES!",
                                    `Wyprawa udana!\n\n+${reward} Stone\n+1 Meat\nNowy poziom lochu: ${player.dungeonLevel}${newUpgradeItems ? `\n+${newUpgradeItems} Upgrade Item` : ""}`,
                                    [{ text: "SUPER", color: "#4CAF50" }]
                                );
                            } else {
                                gameAudio.failure();
                                showModal("PORAŻKA", "Potwory wygoniły cię z lochu. Spróbuj ponownie.", [{ text: "OK", color: "#f44336" }]);
                            }
                        }
                    );
                }
            }
        ]
    );
}

// ============================================================
// PIXEL RPG TYCOON - SCRIPT.JS (CZĘŚĆ 3/3)
// ============================================================

// --- REJESTRACJA ---
async function handleRegister() {
    const nickElem = document.getElementById('nickname-input');
    const passElem = document.getElementById('password-input');

    const nickInput = nickElem ? nickElem.value.trim() : "";
    const passInput = passElem ? passElem.value.trim() : "";

    if (nickInput === "" || passInput === "") {
        return showModal("BŁĄD", "Wpisz zarówno Nick jak i Hasło!", [{ text: "OK", color: "#f44336" }]);
    }

    showModal("ŁADOWANIE...", "Tworzenie konta w chmurze...", []);

    try {
        const docRef = db.collection("users").doc(nickInput);
        const docSnap = await docRef.get();

        if (docSnap.exists && docSnap.data().accountDeleted === true) {
            return showModal("KONTO USUNIĘTE", deletedAccountMessage, [{ text: "OK", color: "#f44336" }]);
        }

        if (docSnap.exists) {
            return showModal("BŁĄD", "Konto o tym nicku już istnieje! Kliknij LOGIN.", [{ text: "OK", color: "#f44336" }]);
        }

        if ((await db.collection("deletedAccounts").doc(nickInput).get()).exists) {
            return showModal("KONTO USUNIĘTE", deletedAccountMessage, [{ text: "OK", color: "#f44336" }]);
        }

        let newPlayer = {
            nickname: nickInput,
            password: passInput,
            rank: (nickInput === "GameMaker_Official") ? "OWNER" : "PLAYER",
            weapon: "None",
            dungeonLevel: 1,
            inventory: { plank: 0, stone: 0, meat: 0, metal: 0, diamond: 0, mythril: 0, upgradeItem: 0 },
            sniperUpgradesUsed: 0,
            sniperLastRewardLevel: 0,
            rankRewardsClaimed: { OWNER: false, VIP: false, FB: false },
            clanId: "",
            globalMessageUsage: { count: 0, windowStartedAt: 0 },
            inbox: []
        };

        await docRef.set(newPlayer);

        showModal("SUKCES!", "Konto utworzone pomyślnie w chmurze!\nKliknij LOGIN.", [{ text: "SUPER", color: "#4CAF50" }]);

    } catch (e) {
        console.error("Błąd rejestracji:", e);
        showModal("BŁĄD FIREBASE", "Nie udało się połączyć z bazą danych.", [{ text: "OK", color: "#f44336" }]);
    }
}

// --- LOGOWANIE ---
async function handleLogin() {
    const nickElem = document.getElementById('nickname-input');
    const passElem = document.getElementById('password-input');

    const nickInput = nickElem ? nickElem.value.trim() : "";
    const passInput = passElem ? passElem.value.trim() : "";

    if (nickInput === "") {
        return showModal("BŁĄD", "Wpisz Nick!", [{ text: "OK", color: "#f44336" }]);
    }

    showModal("ŁADOWANIE...", "Logowanie do chmury...", []);

    try {
        const docRef = db.collection("users").doc(nickInput);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            if ((await db.collection("deletedAccounts").doc(nickInput).get()).exists) {
                return showModal("KONTO USUNIĘTE", deletedAccountMessage, [{ text: "OK", color: "#f44336" }]);
            }
            return showModal("BŁĄD", "Konto nie istnieje! Kliknij REGISTER.", [{ text: "OK", color: "#f44336" }]);
        }

        if (docSnap.data().accountDeleted === true) {
            return showModal("KONTO USUNIĘTE", deletedAccountMessage, [{ text: "OK", color: "#f44336" }]);
        }

        if (passInput === "") {
            return showModal("BŁĄD", "Wpisz Hasło!", [{ text: "OK", color: "#f44336" }]);
        }

        let userData = docSnap.data();

        if (userData.password !== passInput) {
            return showModal("BŁĄD", "Błędne hasło!", [{ text: "OK", color: "#f44336" }]);
        }

        player = userData;
        normalizePlayerData();
        gameAudio.init();

        const rankReward = grantRankReward();
        if (rankReward) {
            await saveProgress();
        }

        updateUI();

        // Przełączenie widoków gry
        const startScreen = document.getElementById("start-screen");
        if (startScreen) startScreen.style.display = "none";

        const setDisplayFlex = (id) => {
            const elem = document.getElementById(id);
            if (elem) elem.style.display = "flex";
        };

        setDisplayFlex("top-bar");
        setDisplayFlex("game-nav-bar");
        setDisplayFlex("zone-lab");
        setDisplayFlex("zone-dungeon");

        // Wyświetlanie komunikatu z nagrodą lub zwykłego powitania
        if (rankReward) {
            showModal("NAGRODA ZA RANGĘ!", rankReward, [{ text: "ODBIERZ", color: "#4CAF50" }]);
        } else {
            showModal("WITAJ!", `Witaj ${player.nickname}!\n\nRanga: ${player.rank}`, [{ text: "START", color: "#4CAF50" }]);
        }

    } catch (e) {
        console.error("Błąd logowania:", e);
        showModal("BŁĄD FIREBASE", "Nie udało się połączyć z bazą danych.\nSprawdź konsolę przeglądarki.", [{ text: "OK", color: "#f44336" }]);
    }
}

// --- EKSPORT FUNKCJI DO ZASIĘGU GLOBALNEGO (DLACZEGO ONCLICK W HTML MÓGŁ NIE DZIAŁAĆ) ---
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.useSniperUpgrade = useSniperUpgrade;
window.openInventory = openInventory;
window.openSocial = openSocial;
window.showLeaderboard = showLeaderboard;
window.openLab = openLab;
window.enterDungeon = enterDungeon;
window.closeModal = closeModal;
window.showModal = showModal;

// --- AUTOMATYCZNE PODPIĘCIE PRZYCISKÓW PO ZAŁADOWANIU DOM ---
document.addEventListener("DOMContentLoaded", () => {
    const audioToggle = document.getElementById("audio-toggle");
    if (audioToggle) audioToggle.addEventListener("click", () => gameAudio.toggle());

    const nicknameInput = document.getElementById("nickname-input");
    const passwordInput = document.getElementById("password-input");
    if (nicknameInput && passwordInput) {
        nicknameInput.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            passwordInput.focus();
            passwordInput.select();
        });
    }

    // Podpinanie przycisku Logowania (po id="btn-login" lub id="login-button")
    const loginBtn = document.getElementById("btn-login") || document.getElementById("login-btn");
    if (loginBtn) loginBtn.addEventListener("click", handleLogin);

    // Podpinanie przycisku Rejestracji
    const registerBtn = document.getElementById("btn-register") || document.getElementById("register-btn");
    if (registerBtn) registerBtn.addEventListener("click", handleRegister);

    // Podpinanie ulepszenia Snajpera
    const upgradeBtn = document.getElementById("btn-use-upgrade") || document.getElementById("use-upgrade-btn");
    if (upgradeBtn) upgradeBtn.addEventListener("click", useSniperUpgrade);
});
                      
