export class AuthState {
    auth = $state({});

    constructor() {
    }

    setAuth(token: string | null) {
        this.auth = { token };
    }

    clearAuth() {
        this.auth = {};
    }
}

export const authState = new AuthState();
