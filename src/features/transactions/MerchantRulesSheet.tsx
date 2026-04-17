import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Switch,
    FlatList,
    Alert,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { runDetached } from '@/lib/async';
import { useOverview } from '@/features/overview/useOverview';
import { useMerchantRules } from './useMerchantRules';
import type { CreateMerchantRuleInput } from './useMerchantRules';
import { buildCategoryMeta, getCategoryDisplayColor } from '@/features/categories/helpers';
import { colors, radius, spacing, typography } from '@/ui/tokens';

interface MerchantRulesSheetProps {
    visible: boolean;
    onDismiss: () => void;
}

type Step = 'list' | 'create' | 'edit';

export function MerchantRulesSheet({ visible, onDismiss }: MerchantRulesSheetProps): ReactElement | null {
    const data = useOverview();
    const { addRule, deleteRule, updateRule } = useMerchantRules();

    const [step, setStep] = useState<Step>('list');
    const [formData, setFormData] = useState<Partial<CreateMerchantRuleInput>>({
        matchTarget: 'normalized_merchant',
        matchType: 'exact',
        kind: 'expense',
        isBlocked: false,
    });
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);
    const userRules = useMemo(
        () =>
            data.merchantRules
                ?.filter((rule) => rule.source === 'manual')
                .sort((a, b) => b.updated_at.localeCompare(a.updated_at)) || [],
        [data.merchantRules]
    );

    const resetForm = useCallback(() => {
        setFormData({
            matchTarget: 'normalized_merchant',
            matchType: 'exact',
            kind: 'expense',
            isBlocked: false,
        });
        setEditingRuleId(null);
    }, []);

    const handleSave = useCallback(async () => {
        if (!formData.pattern?.trim() || !formData.categoryId) {
            Alert.alert('Required fields', 'Pattern and category are required');
            return;
        }

        setLoading(true);
        try {
            if (editingRuleId) {
                await updateRule(editingRuleId, formData);
            } else {
                await addRule(formData as CreateMerchantRuleInput);
            }
            resetForm();
            setStep('list');
            runDetached(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 'merchant-rules.save');
        } catch (error) {
            Alert.alert('Error', `Failed to save rule: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [formData, editingRuleId, addRule, updateRule, resetForm]);

    const handleDelete = useCallback((ruleId: string) => {
        Alert.alert('Delete rule?', 'This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteRule(ruleId);
                        runDetached(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 'merchant-rules.delete');
                    } catch (error) {
                        Alert.alert('Error', `Failed to delete rule: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                },
            },
        ]);
    }, [deleteRule]);

    if (!visible) return null;

    if (step === 'list') {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Merchant Rules</Text>
                    <Pressable
                        style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
                        onPress={onDismiss}
                    >
                        <FontAwesome6 name="xmark" size={24} color={colors.text} />
                    </Pressable>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
                    <Text style={styles.description}>
                        Create rules to automatically categorize merchants. Rules are matched in order of priority.
                    </Text>

                    {userRules.length === 0 ? (
                        <View style={styles.emptyState}>
                            <FontAwesome6 name="inbox" size={48} color={colors.textMuted} />
                            <Text style={styles.emptyTitle}>No rules yet</Text>
                            <Text style={styles.emptyText}>Tap "New rule" to create your first merchant rule</Text>
                        </View>
                    ) : (
                        <FlatList
                            scrollEnabled={false}
                            data={userRules}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => {
                                const category = item.category_id ? categoryMeta[item.category_id] : null;
                                const categoryColor = category
                                    ? getCategoryDisplayColor({
                                        kind: item.kind,
                                        parentName: category.name,
                                        name: category.name,
                                        color: category.color,
                                    })
                                    : colors.textMuted;

                                return (
                                    <View style={styles.ruleCard}>
                                        <View style={styles.ruleHeader}>
                                            <View style={styles.ruleMeta}>
                                                <Text style={styles.rulePattern}>{item.pattern}</Text>
                                                <Text style={styles.ruleSubtext}>
                                                    {item.match_type} match • {item.match_target}
                                                </Text>
                                            </View>
                                            {item.is_blocked && (
                                                <View style={styles.blockedBadge}>
                                                    <Text style={styles.blockedText}>Blocked</Text>
                                                </View>
                                            )}
                                        </View>
                                        <View style={styles.ruleBody}>
                                            <View
                                                style={[
                                                    styles.categoryBadge,
                                                    { backgroundColor: `${categoryColor}20`, borderColor: categoryColor },
                                                ]}
                                            >
                                                <Text style={[styles.categoryText, { color: categoryColor }]}>
                                                    {category?.label || 'Uncategorized'}
                                                </Text>
                                            </View>
                                            {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
                                        </View>
                                        <View style={styles.ruleActions}>
                                            <Pressable
                                                onPress={() => {
                                                    setEditingRuleId(item.id);
                                                    setFormData({
                                                        matchTarget: item.match_target as any,
                                                        matchType: item.match_type as any,
                                                        pattern: item.pattern,
                                                        categoryId: item.category_id ?? undefined,
                                                        kind: item.kind as any,
                                                        canonicalMerchant: item.canonical_merchant || undefined,
                                                        isSharedTopup: item.is_shared_topup,
                                                        isBlocked: item.is_blocked,
                                                        notes: item.notes || undefined,
                                                    });
                                                    setStep('create');
                                                }}
                                            >
                                                <Text style={styles.editLink}>Edit</Text>
                                            </Pressable>
                                            <Pressable
                                                onPress={() => handleDelete(item.id)}
                                                style={{ marginLeft: spacing.lg }}
                                            >
                                                <Text style={styles.deleteLink}>Delete</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                );
                            }}
                        />
                    )}

                    <Pressable
                        style={({ pressed }) => [styles.newRuleButton, pressed && styles.newRuleButtonPressed]}
                        onPress={() => {
                            resetForm();
                            setStep('create');
                        }}
                    >
                        <FontAwesome6 name="plus" size={20} color={colors.bg} />
                        <Text style={styles.newRuleButtonText}>New Rule</Text>
                    </Pressable>
                </ScrollView>
            </View>
        );
    }

    if (step === 'create') {
        const selectableCategories = data.categories.filter((c) => c.level === 1);
        const selectedCategory = formData.categoryId ? categoryMeta[formData.categoryId] : null;

        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{editingRuleId ? 'Edit Rule' : 'New Rule'}</Text>
                    <Pressable
                        style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
                        onPress={() => {
                            setStep('list');
                            resetForm();
                        }}
                    >
                        <FontAwesome6 name="xmark" size={24} color={colors.text} />
                    </Pressable>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Pattern to match</Text>
                        <View style={styles.input}>
                            <FontAwesome6 name="font" size={20} color={colors.textMuted} />
                            <TextInput
                                placeholder="e.g., spotify, apple, grocery store"
                                value={formData.pattern || ''}
                                onChangeText={(value) => setFormData((prev) => ({ ...prev, pattern: value }))}
                                placeholderTextColor={colors.textMuted}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={styles.textInput}
                            />
                        </View>
                        <Text style={styles.hint}>Pattern will be matched in lowercase</Text>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Match type</Text>
                        <View style={styles.optionGroup}>
                            {(['exact', 'prefix', 'contains'] as const).map((type) => (
                                <Pressable
                                    key={type}
                                    style={[
                                        styles.option,
                                        formData.matchType === type && styles.optionSelected,
                                    ]}
                                    onPress={() => setFormData((prev) => ({ ...prev, matchType: type }))}
                                >
                                    <Text
                                        style={[
                                            styles.optionText,
                                            formData.matchType === type && styles.optionTextSelected,
                                        ]}
                                    >
                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Category</Text>
                        <View style={styles.categoryList}>
                            {selectableCategories.map((category) => {
                                const isSelected = formData.categoryId === category.id;
                                return (
                                    <Pressable
                                        key={category.id}
                                        style={[styles.categoryOption, isSelected ? styles.categoryOptionSelected : null]}
                                        onPress={() => setFormData((prev) => ({ ...prev, categoryId: category.id }))}
                                    >
                                        <Text style={isSelected ? styles.categoryOptionTextSelected : styles.categoryOptionText}>
                                            {categoryMeta[category.id]?.label ?? category.name}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        {selectedCategory ? <Text style={styles.hint}>Selected: {selectedCategory.label}</Text> : null}
                    </View>

                    <View style={styles.formGroup}>
                        <View style={styles.toggleRow}>
                            <Text style={styles.label}>Block this pattern (don't auto-categorize)</Text>
                            <Switch
                                value={formData.isBlocked || false}
                                onValueChange={(value) =>
                                    setFormData((prev) => ({ ...prev, isBlocked: value }))
                                }
                            />
                        </View>
                    </View>

                    <Pressable
                        style={({ pressed }) => [
                            styles.saveButton,
                            (loading || !formData.pattern || !formData.categoryId) && styles.saveButtonDisabled,
                            pressed && styles.saveButtonPressed,
                        ]}
                        onPress={() => void handleSave()}
                        disabled={loading || !formData.pattern || !formData.categoryId}
                    >
                        <Text style={styles.saveButtonText}>
                            {loading ? 'Saving...' : editingRuleId ? 'Update Rule' : 'Create Rule'}
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.cancelButton}
                        onPress={() => {
                            setStep('list');
                            resetForm();
                        }}
                    >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>
                </ScrollView>
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    title: {
        ...typography.h2,
        color: colors.text,
    },
    closeButton: {
        padding: spacing.sm,
        borderRadius: radius.pill,
    },
    closeButtonPressed: {
        opacity: 0.7,
        backgroundColor: colors.surface,
    },
    content: {
        flex: 1,
    },
    contentPadding: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    description: {
        ...typography.body,
        color: colors.textMuted,
        marginBottom: spacing.lg,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xxl * 2,
        gap: spacing.md,
    },
    emptyTitle: {
        ...typography.label,
        color: colors.text,
        fontWeight: '600',
    },
    emptyText: {
        ...typography.body,
        color: colors.textMuted,
        textAlign: 'center',
    },
    ruleCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
        gap: spacing.md,
    },
    ruleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    ruleMeta: {
        flex: 1,
    },
    rulePattern: {
        ...typography.label,
        color: colors.text,
        fontWeight: '600',
        marginBottom: spacing.xs,
    },
    ruleSubtext: {
        ...typography.label,
        color: colors.textMuted,
        fontSize: 12,
    },
    blockedBadge: {
        backgroundColor: 'rgba(255,92,122,0.16)',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
    },
    blockedText: {
        ...typography.label,
        color: '#FF5C7A',
        fontSize: 12,
        fontWeight: '600',
    },
    ruleBody: {
        gap: spacing.sm,
    },
    categoryBadge: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    categoryText: {
        ...typography.label,
        fontSize: 12,
        fontWeight: '600',
    },
    notes: {
        ...typography.body,
        color: colors.textMuted,
        fontSize: 13,
    },
    ruleActions: {
        flexDirection: 'row',
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    editLink: {
        ...typography.label,
        color: colors.accent,
        fontWeight: '600',
    },
    deleteLink: {
        ...typography.label,
        color: '#FF5C7A',
        fontWeight: '600',
    },
    newRuleButton: {
        flexDirection: 'row',
        backgroundColor: colors.accent,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.lg,
    },
    newRuleButtonPressed: {
        opacity: 0.85,
    },
    newRuleButtonText: {
        ...typography.label,
        color: colors.bg,
        fontWeight: '600',
    },
    formGroup: {
        marginBottom: spacing.lg,
        gap: spacing.sm,
    },
    label: {
        ...typography.label,
        color: colors.text,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
    },
    textInput: {
        flex: 1,
        paddingVertical: spacing.md,
        color: colors.text,
        ...typography.body,
    },
    hint: {
        ...typography.label,
        color: colors.textMuted,
        fontSize: 12,
    },
    optionGroup: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    option: {
        flex: 1,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    optionSelected: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    optionText: {
        ...typography.label,
        color: colors.text,
        fontWeight: '600',
    },
    optionTextSelected: {
        color: colors.bg,
    },
    categorySelect: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
    },
    selectedCategory: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    categorySelectBadge: {
        width: 12,
        height: 12,
        borderRadius: radius.pill,
    },
    categorySelectText: {
        ...typography.body,
        color: colors.text,
    },
    categorySelectPlaceholder: {
        ...typography.body,
        color: colors.textMuted,
    },
    categoryList: {
        gap: spacing.sm,
    },
    categoryOption: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    categoryOptionSelected: {
        borderColor: colors.accent,
        backgroundColor: `${colors.accent}18`,
    },
    categoryOptionText: {
        ...typography.body,
        color: colors.text,
    },
    categoryOptionTextSelected: {
        ...typography.body,
        color: colors.accent,
        fontWeight: '600',
    },
    toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    saveButton: {
        backgroundColor: colors.accent,
        paddingVertical: spacing.md,
        borderRadius: radius.lg,
        alignItems: 'center',
        marginTop: spacing.lg,
    },
    saveButtonDisabled: {
        opacity: 0.5,
    },
    saveButtonPressed: {
        opacity: 0.85,
    },
    saveButtonText: {
        ...typography.label,
        color: colors.bg,
        fontWeight: '600',
    },
    cancelButton: {
        paddingVertical: spacing.md,
        borderRadius: radius.lg,
        alignItems: 'center',
        marginTop: spacing.md,
    },
    cancelButtonText: {
        ...typography.label,
        color: colors.textMuted,
        fontWeight: '600',
    },
});
