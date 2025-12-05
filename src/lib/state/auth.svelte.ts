export class AuthState {
    auth = $state({});

    constructor() {
    }

    setAuth(token) {
        this.auth = { token };
    }

    clearAuth() {
        this.auth = {};
    }
}

export const authState = new AuthState();
