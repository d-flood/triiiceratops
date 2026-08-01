<script setup>
// An ordinary Vue error boundary: the consumer's own error handling. It does
// NOT return `false`, so the failure also reaches `app.config.errorHandler`.
import { onErrorCaptured, ref } from 'vue';

const message = ref(null);
onErrorCaptured((error) => {
    message.value = String((error && error.message) || error);
});
</script>

<template>
    <div>
        <span data-testid="fragile-error">{{ message ?? 'ok' }}</span>
        <span v-if="message" data-testid="fragile">gone</span>
        <slot v-else />
    </div>
</template>
