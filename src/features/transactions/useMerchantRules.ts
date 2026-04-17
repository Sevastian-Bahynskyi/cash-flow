import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useOverview } from '@/features/overview/useOverview';

export interface CreateMerchantRuleInput {
    matchTarget: 'normalized_merchant' | 'raw_text' | 'bank_category';
    matchType: 'exact' | 'prefix' | 'contains';
    pattern: string;
    categoryId: string;
    kind: 'expense' | 'income';
    canonicalMerchant?: string;
    isSharedTopup?: boolean;
    isBlocked?: boolean;
    notes?: string;
}

export function useMerchantRules() {
    const data = useOverview();

    const addRule = useCallback(
        async (input: CreateMerchantRuleInput): Promise<void> => {
            const { error } = await supabase.from('merchant_category_rules').insert([
                {
                    match_target: input.matchTarget,
                    match_type: input.matchType,
                    pattern: input.pattern.toLowerCase().trim(),
                    category_id: input.categoryId,
                    kind: input.kind,
                    canonical_merchant: input.canonicalMerchant || null,
                    is_shared_topup: input.isSharedTopup || false,
                    is_blocked: input.isBlocked || false,
                    priority: 300, // Manual user-created rules
                    source: 'manual',
                    notes: input.notes || null,
                },
            ]);

            if (error) throw error;
            data.reload();
        },
        [data]
    );

    const deleteRule = useCallback(
        async (ruleId: string): Promise<void> => {
            const { error } = await supabase
                .from('merchant_category_rules')
                .delete()
                .eq('id', ruleId)
                .eq('source', 'manual'); // Only allow deleting manual rules

            if (error) throw error;
            data.reload();
        },
        [data]
    );

    const updateRule = useCallback(
        async (
            ruleId: string,
            updates: Partial<CreateMerchantRuleInput>
        ): Promise<void> => {
            const updateData: Record<string, unknown> = {};

            if (updates.matchTarget) updateData.match_target = updates.matchTarget;
            if (updates.matchType) updateData.match_type = updates.matchType;
            if (updates.pattern !== undefined) updateData.pattern = updates.pattern.toLowerCase().trim();
            if (updates.categoryId) updateData.category_id = updates.categoryId;
            if (updates.kind) updateData.kind = updates.kind;
            if (updates.canonicalMerchant !== undefined) updateData.canonical_merchant = updates.canonicalMerchant;
            if (updates.isSharedTopup !== undefined) updateData.is_shared_topup = updates.isSharedTopup;
            if (updates.isBlocked !== undefined) updateData.is_blocked = updates.isBlocked;
            if (updates.notes !== undefined) updateData.notes = updates.notes;

            const { error } = await supabase
                .from('merchant_category_rules')
                .update(updateData)
                .eq('id', ruleId)
                .eq('source', 'manual');

            if (error) throw error;
            data.reload();
        },
        [data]
    );

    return { addRule, deleteRule, updateRule };
}
