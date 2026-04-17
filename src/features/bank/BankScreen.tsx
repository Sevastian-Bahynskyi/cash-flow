import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useAuth } from '@/features/auth/AuthProvider';
import { bankIconOptions, categoryColorOptions } from '@/features/categories/presentation';
import { useOverview } from '@/features/overview/useOverview';
import type { LoanEventKind } from '@/features/loans/types';
import type { ReceivableEventKind } from '@/features/receivables/types';
import type { SavingsAction } from '@/features/savings/types';
import { runDetached } from '@/lib/async';
import { formatDateLabel, formatMinor } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { ProgressBar } from '@/ui/ProgressBar';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';

type SavingsAccountDraft = {
  id?: string;
  name: string;
  goal: string;
  color: string;
  icon: string;
};

type SavingsActionDraft = {
  accountId: string;
  accountName: string;
  action: SavingsAction;
  amount: string;
  note: string;
};

type LoanDraft = {
  id?: string;
  name: string;
  principal: string;
  remaining: string;
};

type LoanEventDraft = {
  loanId: string;
  loanName: string;
  kind: LoanEventKind;
  amount: string;
};

type ReceivableDraft = {
  id?: string;
  name: string;
  principal: string;
  remaining: string;
};

type ReceivableEventDraft = {
  receivableId: string;
  receivableName: string;
  kind: ReceivableEventKind;
  amount: string;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const parseMinor = (raw: string): number | null => {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
};

function BankSkeleton() {
  return (
    <>
      <SkeletonCard style={styles.skeletonSummaryCard}>
        <SkeletonBlock width={102} height={12} radius={radius.sm} />
        <SkeletonBlock width="54%" height={42} radius={radius.md} />
        <SkeletonBlock width="72%" height={12} radius={radius.sm} />
      </SkeletonCard>

      <View style={styles.heroRow}>
        {[0, 1].map((item) => (
          <SkeletonCard key={item} style={styles.heroCard}>
            <SkeletonBlock width="42%" height={12} radius={radius.sm} />
            <SkeletonBlock width="74%" height={30} radius={radius.md} />
            <SkeletonBlock width="34%" height={12} radius={radius.sm} />
          </SkeletonCard>
        ))}
      </View>

      <SkeletonCard style={styles.skeletonSummaryCard}>
        <SkeletonBlock width={96} height={12} radius={radius.sm} />
        <SkeletonBlock width="46%" height={30} radius={radius.md} />
        <SkeletonBlock width="86%" height={12} radius={radius.sm} />
      </SkeletonCard>

      {['Savings', 'Loans', 'Owed to you'].map((title, index) => (
        <View key={title} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <SkeletonBlock width={index === 0 ? 104 : 94} height={34} radius={radius.pill} />
          </View>

          {[0, 1].map((item) => (
            <SkeletonCard key={item} padding={spacing.md}>
              <View style={styles.skeletonBankRow}>
                <SkeletonBlock width={44} height={44} radius={radius.md} />
                <View style={styles.itemCopy}>
                  <SkeletonBlock width="48%" height={16} />
                  <SkeletonBlock width="62%" height={12} radius={radius.sm} />
                </View>
                <SkeletonBlock width={76} height={18} />
              </View>
              <SkeletonBlock width="100%" height={10} radius={radius.pill} />
            </SkeletonCard>
          ))}
        </View>
      ))}
    </>
  );
}

export default function BankScreen() {
  const { signOut } = useAuth();
  const data = useOverview();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSavingsId, setExpandedSavingsId] = useState<string | null>(null);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [expandedReceivableId, setExpandedReceivableId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState<SavingsAccountDraft | null>(null);
  const [savingsDraft, setSavingsDraft] = useState<SavingsActionDraft | null>(null);
  const [loanDraft, setLoanDraft] = useState<LoanDraft | null>(null);
  const [loanEventDraft, setLoanEventDraft] = useState<LoanEventDraft | null>(null);
  const [receivableDraft, setReceivableDraft] = useState<ReceivableDraft | null>(null);
  const [receivableEventDraft, setReceivableEventDraft] = useState<ReceivableEventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [motionRun, setMotionRun] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setMotionRun((current) => current + 1);
    }, []),
  );

  const savingsWithHistory = useMemo(
    () =>
      data.savingsAccounts.map((account) => ({
        account,
        totalMinor: data.savingsTotalsByAccount[account.id] ?? 0,
        events: data.savingsEvents
          .filter((event) => event.savings_account_id === account.id)
          .sort((a, b) => {
            if (a.occurred_on === b.occurred_on) return b.created_at.localeCompare(a.created_at);
            return b.occurred_on.localeCompare(a.occurred_on);
          }),
      })),
    [data.savingsAccounts, data.savingsEvents, data.savingsTotalsByAccount],
  );

  const loansWithHistory = useMemo(
    () =>
      data.loans.map((loan) => ({
        loan,
        events: data.loanEvents
          .filter((event) => event.loan_id === loan.id)
          .sort((a, b) => {
            if (a.occurred_on === b.occurred_on) return b.created_at.localeCompare(a.created_at);
            return b.occurred_on.localeCompare(a.occurred_on);
          }),
      })),
    [data.loanEvents, data.loans],
  );

  const receivablesWithHistory = useMemo(
    () =>
      data.receivables.map((receivable) => ({
        receivable,
        events: data.receivableEvents
          .filter((event) => event.receivable_id === receivable.id)
          .sort((a, b) => {
            if (a.occurred_on === b.occurred_on) return b.created_at.localeCompare(a.created_at);
            return b.occurred_on.localeCompare(a.occurred_on);
          }),
      })),
    [data.receivableEvents, data.receivables],
  );

  const totalSavingsMinor = savingsWithHistory.reduce((sum, item) => sum + item.totalMinor, 0);
  const totalLoanRemainingMinor = data.openLoans.reduce((sum, loan) => sum + loan.remaining_minor, 0);
  const totalReceivableRemainingMinor = data.openReceivables.reduce((sum, receivable) => sum + receivable.remaining_minor, 0);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const removeSavingsAccount = async (accountId: string): Promise<void> => {
    const { error } = await supabase.from('savings_accounts').delete().eq('id', accountId);
    if (!error) {
      await data.reload();
      setExpandedSavingsId(null);
    }
  };

  const removeLoan = async (loanId: string): Promise<void> => {
    const { error } = await supabase.from('loans').delete().eq('id', loanId);
    if (!error) {
      await data.reload();
      setExpandedLoanId(null);
    }
  };

  const removeReceivable = async (receivableId: string): Promise<void> => {
    const { error } = await supabase.from('receivables').delete().eq('id', receivableId);
    if (!error) {
      await data.reload();
      setExpandedReceivableId(null);
    }
  };

  const saveSavingsAccount = async (): Promise<void> => {
    if (!accountDraft || !data.userId || accountDraft.name.trim().length === 0) return;
    const goalMinor = accountDraft.goal.trim().length > 0 ? parseMinor(accountDraft.goal) : null;
    if (accountDraft.goal.trim().length > 0 && goalMinor === null) return;

    setSaving(true);
    try {
      if (accountDraft.id) {
        const { error } = await supabase
          .from('savings_accounts')
          .update({
            name: accountDraft.name.trim(),
            goal_minor: goalMinor,
            color: accountDraft.color,
            icon: accountDraft.icon,
          })
          .eq('id', accountDraft.id);
        if (!error) {
          await data.reload();
          setAccountDraft(null);
        }
        return;
      }

      const { error } = await supabase.from('savings_accounts').insert({
        user_id: data.userId,
        name: accountDraft.name.trim(),
        goal_minor: goalMinor,
        color: accountDraft.color,
        icon: accountDraft.icon,
      });
      if (!error) {
        await data.reload();
        setAccountDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveSavingsAction = async (): Promise<void> => {
    if (!savingsDraft || !data.userId) return;
    const amountMinor = parseMinor(savingsDraft.amount);
    if (amountMinor === null) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('savings_events').insert({
        user_id: data.userId,
        savings_account_id: savingsDraft.accountId,
        action: savingsDraft.action,
        amount_minor: amountMinor,
        occurred_on: todayIso(),
        note: savingsDraft.note.trim().length > 0 ? savingsDraft.note.trim() : null,
      });
      if (!error) {
        await data.reload();
        setSavingsDraft(null);
        setExpandedSavingsId(savingsDraft.accountId);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveLoan = async (): Promise<void> => {
    if (!loanDraft || !data.userId || loanDraft.name.trim().length === 0) return;
    const principalMinor = parseMinor(loanDraft.principal);
    const remainingMinor = parseMinor(loanDraft.remaining);
    if (principalMinor === null || remainingMinor === null || remainingMinor > principalMinor) return;

    setSaving(true);
    try {
      if (loanDraft.id) {
        const { error } = await supabase
          .from('loans')
          .update({
            name: loanDraft.name.trim(),
            principal_minor: principalMinor,
            remaining_minor: remainingMinor,
            status: remainingMinor === 0 ? 'closed' : 'open',
          })
          .eq('id', loanDraft.id);
        if (!error) {
          await data.reload();
          setLoanDraft(null);
        }
        return;
      }

      const { data: inserted, error } = await supabase
        .from('loans')
        .insert({
          user_id: data.userId,
          name: loanDraft.name.trim(),
          principal_minor: principalMinor,
          remaining_minor: remainingMinor,
          status: remainingMinor === 0 ? 'closed' : 'open',
        })
        .select('id')
        .single();
      if (!error && inserted) {
        await supabase.from('loan_events').insert({
          loan_id: inserted.id,
          user_id: data.userId,
          kind: 'borrowed',
          amount_minor: principalMinor,
          occurred_on: todayIso(),
        });
        await data.reload();
        setLoanDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveLoanEvent = async (): Promise<void> => {
    if (!loanEventDraft || !data.userId) return;
    const amountMinor = parseMinor(loanEventDraft.amount);
    if (amountMinor === null || amountMinor <= 0) return;

    const currentLoan = data.loans.find((loan) => loan.id === loanEventDraft.loanId);
    if (!currentLoan) return;

    const nextPrincipal =
      loanEventDraft.kind === 'borrowed'
        ? currentLoan.principal_minor + amountMinor
        : currentLoan.principal_minor;
    const nextRemaining =
      loanEventDraft.kind === 'borrowed'
        ? currentLoan.remaining_minor + amountMinor
        : Math.max(0, currentLoan.remaining_minor - amountMinor);

    setSaving(true);
    try {
      const { error: eventError } = await supabase.from('loan_events').insert({
        loan_id: currentLoan.id,
        user_id: data.userId,
        kind: loanEventDraft.kind,
        amount_minor: amountMinor,
        occurred_on: todayIso(),
      });
      if (eventError) return;

      const { error: updateError } = await supabase
        .from('loans')
        .update({
          principal_minor: nextPrincipal,
          remaining_minor: nextRemaining,
          status: nextRemaining === 0 ? 'closed' : 'open',
        })
        .eq('id', currentLoan.id);
      if (!updateError) {
        await data.reload();
        setLoanEventDraft(null);
        setExpandedLoanId(currentLoan.id);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveReceivable = async (): Promise<void> => {
    if (!receivableDraft || !data.userId || receivableDraft.name.trim().length === 0) return;
    const principalMinor = parseMinor(receivableDraft.principal);
    const remainingMinor = parseMinor(receivableDraft.remaining);
    if (principalMinor === null || remainingMinor === null || remainingMinor > principalMinor) return;

    setSaving(true);
    try {
      if (receivableDraft.id) {
        const { error } = await supabase
          .from('receivables')
          .update({
            name: receivableDraft.name.trim(),
            principal_minor: principalMinor,
            remaining_minor: remainingMinor,
            status: remainingMinor === 0 ? 'closed' : 'open',
          })
          .eq('id', receivableDraft.id);
        if (!error) {
          await data.reload();
          setReceivableDraft(null);
        }
        return;
      }

      const { data: inserted, error } = await supabase
        .from('receivables')
        .insert({
          user_id: data.userId,
          name: receivableDraft.name.trim(),
          principal_minor: principalMinor,
          remaining_minor: remainingMinor,
          status: remainingMinor === 0 ? 'closed' : 'open',
        })
        .select('id')
        .single();
      if (!error && inserted) {
        await supabase.from('receivable_events').insert({
          receivable_id: inserted.id,
          user_id: data.userId,
          kind: 'lent',
          amount_minor: principalMinor,
          occurred_on: todayIso(),
        });
        await data.reload();
        setReceivableDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveReceivableEvent = async (): Promise<void> => {
    if (!receivableEventDraft || !data.userId) return;
    const amountMinor = parseMinor(receivableEventDraft.amount);
    if (amountMinor === null || amountMinor <= 0) return;

    const currentReceivable = data.receivables.find((receivable) => receivable.id === receivableEventDraft.receivableId);
    if (!currentReceivable) return;

    const nextPrincipal =
      receivableEventDraft.kind === 'lent'
        ? currentReceivable.principal_minor + amountMinor
        : currentReceivable.principal_minor;
    const nextRemaining =
      receivableEventDraft.kind === 'lent'
        ? currentReceivable.remaining_minor + amountMinor
        : Math.max(0, currentReceivable.remaining_minor - amountMinor);

    setSaving(true);
    try {
      const { error: eventError } = await supabase.from('receivable_events').insert({
        receivable_id: currentReceivable.id,
        user_id: data.userId,
        kind: receivableEventDraft.kind,
        amount_minor: amountMinor,
        occurred_on: todayIso(),
      });
      if (eventError) return;

      const { error: updateError } = await supabase
        .from('receivables')
        .update({
          principal_minor: nextPrincipal,
          remaining_minor: nextRemaining,
          status: nextRemaining === 0 ? 'closed' : 'open',
        })
        .eq('id', currentReceivable.id);
      if (!updateError) {
        await data.reload();
        setReceivableEventDraft(null);
        setExpandedReceivableId(currentReceivable.id);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <MotionScope value={motionRun}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
        >
          <ScreenHeader
            title="Bank"
            subtitle="Savings and loans as first-class objects"
            actions={[{ icon: 'right-from-bracket', onPress: () => void signOut() }]}
          />

          {data.isInitialLoading ? <BankSkeleton /> : null}

          {!data.isInitialLoading ? (
            <>
              <MotionView direction="left" distance={210} delayMs={90} rotateFrom={-8}>
                <View style={styles.bankSummaryCard}>
                  <Text style={styles.heroLabel}>Bank balance</Text>
                  <Text style={styles.bankSummaryAmount}>{formatMinor(data.bankBalanceMinor)}</Text>
                  <Text style={styles.heroMeta}>
                    Savings {formatMinor(totalSavingsMinor)} · Loans {formatMinor(totalLoanRemainingMinor)}
                  </Text>
                </View>
              </MotionView>

              <View style={styles.heroRow}>
                <MotionView style={styles.heroMotion} direction="up" distance={120} delayMs={170}>
                  <View style={styles.heroCard}>
                    <Text style={styles.heroLabel}>Savings total</Text>
                    <Text style={[styles.heroAmount, styles.savingsHeroAmount]}>{formatMinor(totalSavingsMinor)}</Text>
                    <Text style={styles.heroMeta}>{savingsWithHistory.length} accounts</Text>
                  </View>
                </MotionView>
                <MotionView style={styles.heroMotion} direction="right" distance={140} delayMs={230}>
                  <View style={styles.heroCard}>
                    <Text style={styles.heroLabel}>Open loans</Text>
                    <Text style={[styles.heroAmount, styles.loanHeroAmount]}>{formatMinor(totalLoanRemainingMinor)}</Text>
                    <Text style={styles.heroMeta}>{data.openLoans.length} active</Text>
                  </View>
                </MotionView>
              </View>

              <MotionView direction="right" distance={195} delayMs={280} rotateFrom={7}>
                <View style={styles.owedSummaryCard}>
                  <Text style={styles.owedSummaryLabel}>Owed to you</Text>
                  <Text style={styles.owedSummaryAmount}>{formatMinor(totalReceivableRemainingMinor)}</Text>
                  <Text style={styles.heroMeta}>
                    Tracked separately. Not counted in your balances until it is actually returned.
                  </Text>
                </View>
              </MotionView>

              <MotionView direction="left" distance={155} delayMs={320}>
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Savings</Text>
                    <Pressable
                      style={({ pressed }) => [styles.inlineButton, pressed && styles.rowPressed]}
                      onPress={() =>
                        setAccountDraft({
                          name: '',
                          goal: '',
                          color: '#3DD68C',
                          icon: 'piggy-bank-outline',
                        })
                      }
                    >
                      <Text style={styles.inlineButtonText}>New savings</Text>
                    </Pressable>
                  </View>

                  {savingsWithHistory.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyText}>Create a savings item here instead of burying it inside transactions.</Text>
                    </View>
                  ) : (
                    savingsWithHistory.map(({ account, totalMinor, events }) => {
                      const ratio = account.goal_minor && account.goal_minor > 0 ? totalMinor / account.goal_minor : 0;
                      const lastEvent = events[0];
                      const expanded = expandedSavingsId === account.id;
                      return (
                        <Pressable
                          key={account.id}
                          style={({ pressed }) => [styles.itemCard, pressed && styles.rowPressed]}
                          onPress={() => setExpandedSavingsId((current) => (current === account.id ? null : account.id))}
                          onLongPress={() =>
                            Alert.alert(account.name, undefined, [
                              {
                                text: 'Edit',
                                onPress: () =>
                                  setAccountDraft({
                                    id: account.id,
                                    name: account.name,
                                    goal: account.goal_minor ? (account.goal_minor / 100).toFixed(2) : '',
                                    color: account.color,
                                    icon: account.icon,
                                  }),
                              },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () => {
                                  runDetached(removeSavingsAccount(account.id), 'bank.removeSavingsAccount');
                                },
                              },
                              { text: 'Cancel', style: 'cancel' },
                            ])
                          }
                        >
                          <View style={styles.itemHead}>
                            <View style={[styles.iconWrap, { backgroundColor: `${account.color}22` }]}>
                              <CategoryIcon name={account.icon} size={22} color={account.color} />
                            </View>
                            <View style={styles.itemCopy}>
                              <Text style={styles.itemTitle}>{account.name}</Text>
                              <Text style={styles.itemMeta}>
                                {lastEvent ? `${lastEvent.action} · ${formatDateLabel(lastEvent.occurred_on)}` : 'No activity yet'}
                              </Text>
                            </View>
                            <Text style={styles.itemAmount}>{formatMinor(totalMinor)}</Text>
                          </View>
                          <ProgressBar value={ratio} color={account.color} />
                          <Text style={styles.itemMeta}>
                            {account.goal_minor ? `Goal ${formatMinor(account.goal_minor)}` : 'No goal set yet'}
                          </Text>

                          {expanded ? (
                            <View style={styles.expandedBody}>
                              <View style={styles.actionRow}>
                                {(['add', 'remove', 'set'] as const).map((action) => (
                                  <Pressable
                                    key={action}
                                    style={({ pressed }) => [styles.actionChip, pressed && styles.rowPressed]}
                                    onPress={() =>
                                      setSavingsDraft({
                                        accountId: account.id,
                                        accountName: account.name,
                                        action,
                                        amount: '',
                                        note: '',
                                      })
                                    }
                                  >
                                    <Text style={styles.actionChipText}>{action}</Text>
                                  </Pressable>
                                ))}
                              </View>
                              <View style={styles.historyList}>
                                {events.length === 0 ? (
                                  <Text style={styles.itemMeta}>No history yet.</Text>
                                ) : (
                                  events.slice(0, 6).map((event) => (
                                    <View key={event.id} style={styles.historyRow}>
                                      <Text style={styles.historyText}>
                                        {event.action} {formatMinor(event.amount_minor)}
                                      </Text>
                                      <Text style={styles.historyMeta}>{formatDateLabel(event.occurred_on)}</Text>
                                    </View>
                                  ))
                                )}
                              </View>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </MotionView>

              <MotionView direction="right" distance={155} delayMs={380}>
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Loans</Text>
                    <Pressable
                      style={({ pressed }) => [styles.inlineButton, pressed && styles.rowPressed]}
                      onPress={() =>
                        setLoanDraft({
                          name: '',
                          principal: '',
                          remaining: '',
                        })
                      }
                    >
                      <Text style={styles.inlineButtonText}>New loan</Text>
                    </Pressable>
                  </View>

                  {loansWithHistory.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyText}>Create a loan here and keep its repayment history visible.</Text>
                    </View>
                  ) : (
                    loansWithHistory.map(({ loan, events }) => {
                      const ratio = loan.principal_minor === 0 ? 1 : 1 - loan.remaining_minor / loan.principal_minor;
                      const lastPayment = events.find((event) => event.kind === 'repaid');
                      const expanded = expandedLoanId === loan.id;
                      return (
                        <Pressable
                          key={loan.id}
                          style={({ pressed }) => [styles.itemCard, pressed && styles.rowPressed]}
                          onPress={() => setExpandedLoanId((current) => (current === loan.id ? null : loan.id))}
                          onLongPress={() =>
                            Alert.alert(loan.name, undefined, [
                              {
                                text: 'Edit',
                                onPress: () =>
                                  setLoanDraft({
                                    id: loan.id,
                                    name: loan.name,
                                    principal: (loan.principal_minor / 100).toFixed(2),
                                    remaining: (loan.remaining_minor / 100).toFixed(2),
                                  }),
                              },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () => {
                                  runDetached(removeLoan(loan.id), 'bank.removeLoan');
                                },
                              },
                              { text: 'Cancel', style: 'cancel' },
                            ])
                          }
                        >
                          <View style={styles.itemHead}>
                            <View style={[styles.iconWrap, { backgroundColor: 'rgba(124,92,255,0.18)' }]}>
                              <FontAwesome6 name="building-columns" size={22} color={colors.accent} />
                            </View>
                            <View style={styles.itemCopy}>
                              <Text style={styles.itemTitle}>{loan.name}</Text>
                              <Text style={styles.itemMeta}>
                                {lastPayment ? `Last payment ${formatDateLabel(lastPayment.occurred_on)}` : 'No repayments yet'}
                              </Text>
                            </View>
                            <Text style={styles.itemAmount}>{formatMinor(loan.remaining_minor)}</Text>
                          </View>
                          <ProgressBar value={ratio} color={loan.remaining_minor === 0 ? colors.success : colors.accent} />
                          <Text style={styles.itemMeta}>
                            {loan.remaining_minor === 0 ? 'Closed' : `Principal ${formatMinor(loan.principal_minor)}`}
                          </Text>

                          {expanded ? (
                            <View style={styles.expandedBody}>
                              <View style={styles.actionRow}>
                                <Pressable
                                  style={({ pressed }) => [styles.actionChip, pressed && styles.rowPressed]}
                                  onPress={() =>
                                    setLoanEventDraft({
                                      loanId: loan.id,
                                      loanName: loan.name,
                                      kind: 'repaid',
                                      amount: '',
                                    })
                                  }
                                >
                                  <Text style={styles.actionChipText}>Repayment</Text>
                                </Pressable>
                                <Pressable
                                  style={({ pressed }) => [styles.actionChip, pressed && styles.rowPressed]}
                                  onPress={() =>
                                    setLoanEventDraft({
                                      loanId: loan.id,
                                      loanName: loan.name,
                                      kind: 'borrowed',
                                      amount: '',
                                    })
                                  }
                                >
                                  <Text style={styles.actionChipText}>Borrow more</Text>
                                </Pressable>
                              </View>
                              <View style={styles.historyList}>
                                {events.length === 0 ? (
                                  <Text style={styles.itemMeta}>No history yet.</Text>
                                ) : (
                                  events.slice(0, 6).map((event) => (
                                    <View key={event.id} style={styles.historyRow}>
                                      <Text style={styles.historyText}>
                                        {event.kind} {formatMinor(event.amount_minor)}
                                      </Text>
                                      <Text style={styles.historyMeta}>{formatDateLabel(event.occurred_on)}</Text>
                                    </View>
                                  ))
                                )}
                              </View>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </MotionView>

              <MotionView direction="left" distance={165} delayMs={440}>
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>Owed to you</Text>
                    <Pressable
                      style={({ pressed }) => [styles.inlineButton, pressed && styles.rowPressed]}
                      onPress={() =>
                        setReceivableDraft({
                          name: '',
                          principal: '',
                          remaining: '',
                        })
                      }
                    >
                      <Text style={styles.inlineButtonText}>New item</Text>
                    </Pressable>
                  </View>

                  {receivablesWithHistory.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyText}>Track money people owe you without treating it as cash-on-hand.</Text>
                    </View>
                  ) : (
                    receivablesWithHistory.map(({ receivable, events }) => {
                      const ratio = receivable.principal_minor === 0 ? 1 : 1 - receivable.remaining_minor / receivable.principal_minor;
                      const lastRepayment = events.find((event) => event.kind === 'repaid');
                      const expanded = expandedReceivableId === receivable.id;
                      return (
                        <Pressable
                          key={receivable.id}
                          style={({ pressed }) => [styles.itemCard, styles.receivableCard, pressed && styles.rowPressed]}
                          onPress={() => setExpandedReceivableId((current) => (current === receivable.id ? null : receivable.id))}
                          onLongPress={() =>
                            Alert.alert(receivable.name, undefined, [
                              {
                                text: 'Edit',
                                onPress: () =>
                                  setReceivableDraft({
                                    id: receivable.id,
                                    name: receivable.name,
                                    principal: (receivable.principal_minor / 100).toFixed(2),
                                    remaining: (receivable.remaining_minor / 100).toFixed(2),
                                  }),
                              },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () => {
                                  runDetached(removeReceivable(receivable.id), 'bank.removeReceivable');
                                },
                              },
                              { text: 'Cancel', style: 'cancel' },
                            ])
                          }
                        >
                          <View style={styles.itemHead}>
                            <View style={[styles.iconWrap, { backgroundColor: 'rgba(245,185,66,0.18)' }]}>
                              <FontAwesome6 name="money-bill-transfer" size={22} color={colors.accentAlt} />
                            </View>
                            <View style={styles.itemCopy}>
                              <Text style={styles.itemTitle}>{receivable.name}</Text>
                              <Text style={styles.itemMeta}>
                                {lastRepayment ? `Last return ${formatDateLabel(lastRepayment.occurred_on)}` : 'Nothing returned yet'}
                              </Text>
                            </View>
                            <Text style={[styles.itemAmount, styles.receivableAmount]}>{formatMinor(receivable.remaining_minor)}</Text>
                          </View>
                          <ProgressBar value={ratio} color={receivable.remaining_minor === 0 ? colors.success : colors.accentAlt} />
                          <Text style={styles.itemMeta}>
                            {receivable.remaining_minor === 0 ? 'Settled' : `Original amount ${formatMinor(receivable.principal_minor)}`}
                          </Text>

                          {expanded ? (
                            <View style={styles.expandedBody}>
                              <View style={styles.actionRow}>
                                <Pressable
                                  style={({ pressed }) => [styles.actionChip, styles.actionChipAlt, pressed && styles.rowPressed]}
                                  onPress={() =>
                                    setReceivableEventDraft({
                                      receivableId: receivable.id,
                                      receivableName: receivable.name,
                                      kind: 'repaid',
                                      amount: '',
                                    })
                                  }
                                >
                                  <Text style={styles.actionChipText}>Returned</Text>
                                </Pressable>
                                <Pressable
                                  style={({ pressed }) => [styles.actionChip, styles.actionChipAlt, pressed && styles.rowPressed]}
                                  onPress={() =>
                                    setReceivableEventDraft({
                                      receivableId: receivable.id,
                                      receivableName: receivable.name,
                                      kind: 'lent',
                                      amount: '',
                                    })
                                  }
                                >
                                  <Text style={styles.actionChipText}>Lend more</Text>
                                </Pressable>
                              </View>
                              <View style={styles.historyList}>
                                {events.length === 0 ? (
                                  <Text style={styles.itemMeta}>No history yet.</Text>
                                ) : (
                                  events.slice(0, 6).map((event) => (
                                    <View key={event.id} style={styles.historyRow}>
                                      <Text style={styles.historyText}>
                                        {event.kind} {formatMinor(event.amount_minor)}
                                      </Text>
                                      <Text style={styles.historyMeta}>{formatDateLabel(event.occurred_on)}</Text>
                                    </View>
                                  ))
                                )}
                              </View>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </MotionView>
            </>
          ) : null}
        </ScrollView>
      </MotionScope>

      <Modal
        visible={accountDraft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAccountDraft(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => setAccountDraft(null)}
            title={accountDraft?.id ? 'Edit Savings' : 'New Savings'}
            actions={[{ icon: 'check', onPress: () => runDetached(saveSavingsAccount(), 'bank.saveSavingsAccount'), disabled: saving }]}
          />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={accountDraft?.name ?? ''}
              onChangeText={(value) => setAccountDraft((current) => (current ? { ...current, name: value } : current))}
              placeholder="Emergency fund"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Goal</Text>
            <TextInput
              value={accountDraft?.goal ?? ''}
              onChangeText={(value) => setAccountDraft((current) => (current ? { ...current, goal: value } : current))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Icon</Text>
            <View style={styles.optionRow}>
              {bankIconOptions.map((icon) => {
                const active = accountDraft?.icon === icon;
                return (
                  <Pressable
                    key={icon}
                    style={({ pressed }) => [
                      styles.optionTile,
                      active && styles.optionTileActive,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => setAccountDraft((current) => (current ? { ...current, icon } : current))}
                  >
                    <CategoryIcon name={icon} size={18} color={active ? colors.text : colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Color</Text>
            <View style={styles.optionRow}>
              {categoryColorOptions.map((color) => {
                const active = accountDraft?.color === color;
                return (
                  <Pressable
                    key={color}
                    style={({ pressed }) => [
                      styles.colorChip,
                      { backgroundColor: color },
                      active && styles.colorChipActive,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => setAccountDraft((current) => (current ? { ...current, color } : current))}
                  />
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={savingsDraft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSavingsDraft(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => setSavingsDraft(null)}
            title="Savings Action"
            subtitle={savingsDraft?.accountName}
            actions={[{ icon: 'check', onPress: () => runDetached(saveSavingsAction(), 'bank.saveSavingsAction'), disabled: saving }]}
          />
          <View style={styles.modalContent}>
            <Text style={styles.label}>Action</Text>
            <View style={styles.actionRow}>
              {(['add', 'remove', 'set'] as const).map((action) => (
                <Pressable
                  key={action}
                  style={({ pressed }) => [
                    styles.actionChip,
                    savingsDraft?.action === action && styles.actionChipActive,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => setSavingsDraft((current) => (current ? { ...current, action } : current))}
                >
                  <Text style={styles.actionChipText}>{action}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Amount</Text>
            <TextInput
              value={savingsDraft?.amount ?? ''}
              onChangeText={(value) => setSavingsDraft((current) => (current ? { ...current, amount: value } : current))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Note</Text>
            <TextInput
              value={savingsDraft?.note ?? ''}
              onChangeText={(value) => setSavingsDraft((current) => (current ? { ...current, note: value } : current))}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={loanDraft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLoanDraft(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => setLoanDraft(null)}
            title={loanDraft?.id ? 'Edit Loan' : 'New Loan'}
            actions={[{ icon: 'check', onPress: () => runDetached(saveLoan(), 'bank.saveLoan'), disabled: saving }]}
          />
          <View style={styles.modalContent}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={loanDraft?.name ?? ''}
              onChangeText={(value) => setLoanDraft((current) => (current ? { ...current, name: value } : current))}
              placeholder="Student loan"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Principal</Text>
            <TextInput
              value={loanDraft?.principal ?? ''}
              onChangeText={(value) => setLoanDraft((current) => (current ? { ...current, principal: value } : current))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Remaining</Text>
            <TextInput
              value={loanDraft?.remaining ?? ''}
              onChangeText={(value) => setLoanDraft((current) => (current ? { ...current, remaining: value } : current))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={loanEventDraft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLoanEventDraft(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => setLoanEventDraft(null)}
            title={loanEventDraft?.kind === 'repaid' ? 'Repayment' : 'Borrow More'}
            subtitle={loanEventDraft?.loanName}
            actions={[{ icon: 'check', onPress: () => runDetached(saveLoanEvent(), 'bank.saveLoanEvent'), disabled: saving }]}
          />
          <View style={styles.modalContent}>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              value={loanEventDraft?.amount ?? ''}
              onChangeText={(value) => setLoanEventDraft((current) => (current ? { ...current, amount: value } : current))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={receivableDraft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReceivableDraft(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => setReceivableDraft(null)}
            title={receivableDraft?.id ? 'Edit Owed Item' : 'New Owed Item'}
            actions={[{ icon: 'check', onPress: () => runDetached(saveReceivable(), 'bank.saveReceivable'), disabled: saving }]}
          />
          <View style={styles.modalContent}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={receivableDraft?.name ?? ''}
              onChangeText={(value) => setReceivableDraft((current) => (current ? { ...current, name: value } : current))}
              placeholder="Anna"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Original amount</Text>
            <TextInput
              value={receivableDraft?.principal ?? ''}
              onChangeText={(value) => setReceivableDraft((current) => (current ? { ...current, principal: value } : current))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Still owed</Text>
            <TextInput
              value={receivableDraft?.remaining ?? ''}
              onChangeText={(value) => setReceivableDraft((current) => (current ? { ...current, remaining: value } : current))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={receivableEventDraft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReceivableEventDraft(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => setReceivableEventDraft(null)}
            title={receivableEventDraft?.kind === 'repaid' ? 'Money Returned' : 'Lend More'}
            subtitle={receivableEventDraft?.receivableName}
            actions={[{ icon: 'check', onPress: () => runDetached(saveReceivableEvent(), 'bank.saveReceivableEvent'), disabled: saving }]}
          />
          <View style={styles.modalContent}>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              value={receivableEventDraft?.amount ?? ''}
              onChangeText={(value) => setReceivableEventDraft((current) => (current ? { ...current, amount: value } : current))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl * 3, gap: spacing.lg },
  bankSummaryCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  skeletonSummaryCard: { marginHorizontal: spacing.lg },
  owedSummaryCard: {
    marginHorizontal: spacing.lg,
    marginTop: -4,
    backgroundColor: 'rgba(245,185,66,0.12)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(245,185,66,0.28)',
  },
  heroRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  heroMotion: { flex: 1 },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount: { ...typography.h2, color: colors.text },
  savingsHeroAmount: { color: colors.success },
  loanHeroAmount: { color: colors.danger },
  bankSummaryAmount: { ...typography.h1, color: colors.text },
  owedSummaryLabel: { ...typography.label, color: colors.accentAlt, textTransform: 'uppercase', letterSpacing: 0.5 },
  owedSummaryAmount: { ...typography.h2, color: colors.accentAlt },
  heroMeta: { ...typography.label, color: colors.textMuted },
  section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  skeletonBankRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  inlineButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  inlineButtonText: { ...typography.label, color: colors.text },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyText: { ...typography.body, color: colors.textMuted },
  itemCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  receivableCard: {
    borderWidth: 1,
    borderColor: 'rgba(245,185,66,0.18)',
  },
  itemHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCopy: { flex: 1, gap: 2 },
  itemTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  itemMeta: { ...typography.label, color: colors.textMuted },
  itemAmount: { ...typography.body, color: colors.text, fontWeight: '700' },
  receivableAmount: { color: colors.accentAlt },
  expandedBody: { gap: spacing.sm, paddingTop: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  actionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  actionChipActive: { backgroundColor: 'rgba(124,92,255,0.18)' },
  actionChipAlt: { backgroundColor: 'rgba(245,185,66,0.18)' },
  actionChipText: { ...typography.label, color: colors.text },
  historyList: { gap: spacing.xs },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  historyText: { ...typography.label, color: colors.text },
  historyMeta: { ...typography.label, color: colors.textMuted },
  rowPressed: { opacity: 0.86 },
  modalSafeArea: { flex: 1, backgroundColor: colors.bg },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionTile: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionTileActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(124,92,255,0.18)',
  },
  colorChip: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorChipActive: { borderColor: colors.text },
});
