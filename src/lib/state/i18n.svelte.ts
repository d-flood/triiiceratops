import * as messages from "../paraglide/messages.js";
import { languageTag, onSetLanguageTag } from "../paraglide/runtime.js";

let tag = $state(languageTag());

onSetLanguageTag((newTag) => {
    tag = newTag;
});

export const language = {
    get current() {
        return tag;
    }
};

export const m = new Proxy(messages, {
    get(target, prop, receiver) {
        // Register dependency by accessing the signal
        tag;
        return Reflect.get(target, prop, receiver);
    }
});
