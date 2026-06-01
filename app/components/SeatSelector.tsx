import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type SeatSelectorProps = {
    value: number;
    max: number;
    onChange: (next: number) => void;
    disabled?: boolean;
    label?: string;
};

export default function SeatSelector({
    value,
    max,
    onChange,
    disabled = false,
    label = 'Seats',
}: SeatSelectorProps) {
    const safeMax = Math.max(0, max);
    const canDecrease = !disabled && value > 1;
    const canIncrease = !disabled && value < safeMax;

    return (
        <View style={styles.wrap}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <View style={styles.row}>
                <TouchableOpacity
                    style={[styles.stepBtn, !canDecrease && styles.stepBtnDisabled]}
                    onPress={() => canDecrease && onChange(value - 1)}
                    disabled={!canDecrease}
                    accessibilityLabel="Decrease seats"
                >
                    <Text style={[styles.stepText, !canDecrease && styles.stepTextDisabled]}>−</Text>
                </TouchableOpacity>
                <Text style={styles.value}>{value}</Text>
                <TouchableOpacity
                    style={[styles.stepBtn, !canIncrease && styles.stepBtnDisabled]}
                    onPress={() => canIncrease && onChange(value + 1)}
                    disabled={!canIncrease}
                    accessibilityLabel="Increase seats"
                >
                    <Text style={[styles.stepText, !canIncrease && styles.stepTextDisabled]}>+</Text>
                </TouchableOpacity>
            </View>
            {safeMax > 0 ? (
                <Text style={styles.hint}>
                    {safeMax} available
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center' },
    label: { fontSize: 12, color: '#666', marginBottom: 6, fontWeight: '600' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    stepBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#e8f0fe',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepBtnDisabled: { backgroundColor: '#f0f0f0' },
    stepText: { fontSize: 22, fontWeight: '600', color: '#1a73e8', lineHeight: 24 },
    stepTextDisabled: { color: '#bbb' },
    value: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        minWidth: 28,
        textAlign: 'center',
    },
    hint: { fontSize: 11, color: '#888', marginTop: 4 },
});
