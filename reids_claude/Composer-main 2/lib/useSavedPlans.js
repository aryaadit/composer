'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';

/**
 * Saved plans store — Firestore only.
 *
 * Reads users/{uid}/saved/* in real-time and exposes savePlan/deletePlan
 * helpers. The app gates on sign-in at the root, so there is no
 * anonymous fallback anymore.
 */
export function useSavedPlans() {
  const { user, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setPlans([]);
      setLoading(false);
      return;
    }

    const col = collection(db, 'users', user.uid, 'saved');
    const q = query(col, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPlans(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error('saved plans subscribe failed', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [authLoading, user]);

  const savePlan = useCallback(
    async (plan) => {
      if (!user) throw new Error('Not signed in');
      await addDoc(collection(db, 'users', user.uid, 'saved'), {
        ...plan,
        createdAt: serverTimestamp(),
      });
    },
    [user]
  );

  const deletePlan = useCallback(
    async (id) => {
      if (!user) throw new Error('Not signed in');
      await deleteDoc(doc(db, 'users', user.uid, 'saved', id));
    },
    [user]
  );

  return { plans, loading, savePlan, deletePlan };
}
