-- SSL Distributor Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/cbfwizrivaaqibykulis/sql

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  company TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('master_admin','partner','customer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gogetssl_order_id BIGINT UNIQUE,
  gogetssl_item_id INTEGER,
  product_name TEXT NOT NULL,
  ca TEXT,
  domain TEXT,
  status TEXT DEFAULT 'pending',
  is_automation BOOLEAN DEFAULT FALSE,
  api_response JSONB,
  subscription_begin DATE,
  next_renewal DATE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_admin_read" ON public.profiles FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master_admin'));
CREATE POLICY "orders_admin_all" ON public.orders FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master_admin'));
CREATE POLICY "orders_partner_assigned" ON public.orders FOR ALL USING (assigned_to = auth.uid());
CREATE POLICY "orders_customer_view" ON public.orders FOR SELECT USING (customer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- After running schema, create your master admin account via Supabase Auth dashboard
-- Then update their role:
-- UPDATE public.profiles SET role = 'master_admin' WHERE email = 'mathivanan@gogetssl.com';
