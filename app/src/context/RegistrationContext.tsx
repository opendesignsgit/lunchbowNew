import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from 'context/AuthContext';
import React, { createContext, useContext, useEffect, useState } from 'react';
import RegistrationService from 'services/RegistartionService/registartion';

type RegistrationContextType = {
  currentStep: number | null;
  hasCompletedRegistration: boolean;
  isSubscriptionExpired: boolean;
  subscriptionEndDate: string | null;
  loading: boolean;
  refreshRegistration: () => Promise<void>;
};

const RegistrationContext = createContext<RegistrationContextType>({
  currentStep: null,
  hasCompletedRegistration: false,
  isSubscriptionExpired: false,
  subscriptionEndDate: null,
  loading: true,
  refreshRegistration: async () => {},
});

export const RegistrationProvider = ({ children }: any) => {
  const { userId } = useAuth();
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRegistrationStatus = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const res: any = await RegistrationService.registrationCheck({ _id: userId, path: 'Step-Check' });
      const fetchedStep = Number(res?.data?.step);
      setCurrentStep(fetchedStep);
      await AsyncStorage.setItem('@registrationStep', String(fetchedStep));

      // Persist subscription end date for expiry check
      const endDate = res?.data?.subscriptionPlan?.endDate || null;
      setSubscriptionEndDate(endDate);
    } catch (err) {
      console.log('Registration check API failed:', err);
      // Fall back to cached step if available
      const cachedStep = await AsyncStorage.getItem('@registrationStep');
      if (cachedStep) {
        setCurrentStep(Number(cachedStep));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      // Use cache for fast first render, then refresh in background
      const cachedStep = await AsyncStorage.getItem('@registrationStep');
      if (cachedStep) {
        setCurrentStep(Number(cachedStep));
        setLoading(false);
      }
      // Always refresh from API to get latest subscription status
      await fetchRegistrationStatus();
    };
    init();
  }, [userId]);

  const isSubscriptionExpired = (() => {
    if (!subscriptionEndDate) return false;
    return new Date(subscriptionEndDate) < new Date();
  })();

  return (
    <RegistrationContext.Provider
      value={{
        currentStep,
        hasCompletedRegistration: !!currentStep && currentStep >= 4,
        isSubscriptionExpired,
        subscriptionEndDate,
        loading,
        refreshRegistration: fetchRegistrationStatus,
      }}
    >
      {children}
    </RegistrationContext.Provider>
  );
};

export const useRegistration = () => useContext(RegistrationContext);

