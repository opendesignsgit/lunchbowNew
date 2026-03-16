import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from 'context/AuthContext';
import React, { createContext, useContext, useEffect, useState } from 'react';
import RegistrationService from 'services/RegistartionService/registartion';

type RegistrationContextType = {
  currentStep: number | null;
  hasCompletedRegistration: boolean;
  loading: boolean;
};

const RegistrationContext = createContext<RegistrationContextType>({
  currentStep: null,
  hasCompletedRegistration: false,
  loading: true,
});

export const RegistrationProvider = ({ children }: any) => {
  const { userId } = useAuth();
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const cachedStep = await AsyncStorage.getItem('@registrationStep');
      if (cachedStep) {
        setCurrentStep(Number(cachedStep));
        setLoading(false);
        return; 
      }

      if (userId) {
        try {
          const res: any = await RegistrationService.registrationCheck({ _id: userId, path: 'Step-Check' });
          const fetchedStep = Number(res?.data?.step);
          setCurrentStep(fetchedStep);
          await AsyncStorage.setItem('@registrationStep', String(fetchedStep));
        } catch (err) {
          console.log('API fetch failed:', err);
        }
      }
      setLoading(false);
    };

    init();
  }, [userId]);

  return (
    <RegistrationContext.Provider
      value={{
        currentStep,
        hasCompletedRegistration: !!currentStep && currentStep >= 4,
        loading,
      }}
    >
      {children}
    </RegistrationContext.Provider>
  );
};

export const useRegistration = () => useContext(RegistrationContext);
