// The client half of the default gamemode: the way into the server. The join's loading screen stays
// up until the login page is on screen, so the first thing the player sees of the server is the page
// over the cinematic. Until they have logged in the HUD is hidden, the camera flies over the wasteland
// and the page sits over it; once they have, the screen goes black, the server places them with no
// loading screen, and the world fades back in where they play. The server decides everything; this
// side only shows what it is told and sends back what was typed.

import { AuthEvents, type AuthPrompt, type AuthSubmit, type CreatorMenuClosed, isCreatorMenu } from "../shared/auth";
import * as Cinematic from "./cinematic";
import "./life";
import * as Login from "./login";

const kHelloRetryMs = 500;
const kFadeSeconds = 1;
const kCutAfterMs: number = (kFadeSeconds + 0.2) * 1000;
// The server's `placed` follows its move in order; the move itself runs on the player's next update,
// so the fade back in waits a moment past it.
const kFadeInAfterPlacedMs = 250;

let loggedIn = false;

const submit = (submitted: AuthSubmit): void => {
    Login.setBusy();
    Events.emitServer(AuthEvents.submit, submitted);
};

// Taken over from the join the moment this resource starts, before the client lets it go for the
// server's world; hidden once the page can be seen. The page is created now too, under it, so it has
// painted long before the prompt fills it in.
Ui.showLoadingScreen();
Login.preload(submit);

Events.on(AuthEvents.prompt, (payload: unknown): void => {
    const prompt = payload as AuthPrompt;
    Hud.setVisible(false);
    Cinematic.start(prompt.shots);
    Login.show(prompt, submit, (): void => {
        Ui.hideLoadingScreen();
    });
});

// Out of the cinematic through black, so the cut to the player's own camera never shows.
Events.on(AuthEvents.done, (): void => {
    loggedIn = true;
    Login.finish();
    Hud.fade({ duration: kFadeSeconds, hold: true });
    setTimeout((): void => {
        Cinematic.stop();
        Login.close();
        // The server places the player only now: a teleport under the cinematic's fly camera strands it.
        Events.emitServer(AuthEvents.cut);
    }, kCutAfterMs);
});

// The player stands where they play, placed under black with no loading screen: back to the world.
Events.on(AuthEvents.placed, (): void => {
    setTimeout((): void => {
        Hud.setVisible(true);
        Hud.fade({ out: false, duration: kFadeSeconds });
    }, kFadeInAfterPlacedMs);
});

// The character creator rides the game's menus; the server opens them and hears here when each closes.
Events.on("menuClose", (name: string): void => {
    if (loggedIn && isCreatorMenu(name)) {
        Events.emitServer(AuthEvents.menuClosed, { menu: name } satisfies CreatorMenuClosed);
    }
});

// The server answers once the player stands in the world: until the fly camera can be taken there is
// no world to show, so keep asking until it can, then hand the camera to the cinematic.
const hello: number = setInterval((): void => {
    if (loggedIn) {
        clearInterval(hello);
        return;
    }
    if (Cinematic.isRunning() || NoClip.isEnabled() || NoClip.enable()) {
        clearInterval(hello);
        Events.emitServer(AuthEvents.hello);
    }
}, kHelloRetryMs);
