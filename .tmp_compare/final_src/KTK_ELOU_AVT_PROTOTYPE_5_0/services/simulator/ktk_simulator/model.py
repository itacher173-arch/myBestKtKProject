from __future__ import annotations

import json, threading
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "elou-avt-modular-5.0.0"

def clamp(v, lo, hi): return max(lo, min(hi, float(v)))
def lag(v, target, tau, dt): return v + (target-v)*min(dt/tau, 1)

CONTROL_META = {
 "feed_sp":(0,1100,"м³/ч"), "raw_temp":(5,45,"°C"), "raw_water":(.05,2,"%"), "raw_salt":(1,150,"мг/л"), "raw_density":(780,930,"кг/м³"),
 "branch_1":(0,100,"%"), "branch_2":(0,100,"%"), "branch_3":(0,100,"%"), "preheat_bypass":(0,100,"%"),
 "wash_water":(0,12,"%"), "demulsifier":(0,35,"г/т"), "mix_dp":(.2,2.5,"кгс/см²"), "voltage_s1":(0,5,"кВ"), "voltage_s2":(0,22,"кВ"), "drain_s1":(0,100,"%"), "drain_s2":(0,100,"%"),
 "n20_flow":(0,1050,"м³/ч"), "k1_bottom_out":(0,100,"%"), "k1_reflux":(0,160,"м³/ч"), "k1_steam":(0,1200,"кг/ч"), "e1_water_drain":(0,100,"%"),
 "p1_fuel":(0,100,"%"), "p2_fuel":(0,100,"%"), "p3_fuel":(0,100,"%"), "p4_fuel":(0,100,"%"), "p1_flow":(0,100,"%"), "p2_flow":(0,100,"%"), "p3_flow":(0,100,"%"), "p4_flow":(0,100,"%"),
 "k2_feed":(0,950,"м³/ч"), "k2_bottom_out":(0,100,"%"), "k2_reflux":(0,120,"м³/ч"), "k2_steam":(0,1800,"кг/ч"), "e2_water_drain":(0,100,"%"),
 "avz3":(0,100,"%"), "avz45":(0,100,"%"), "circ1":(0,220,"м³/ч"), "circ2":(0,180,"м³/ч"), "circ3":(0,170,"м³/ч")
}

class Model:
 def __init__(self):
  self.lock=threading.RLock(); self.scenarios=json.loads((ROOT/'scenario_defaults.json').read_text(encoding='utf-8')); self.reset()
 def reset(self, mode='normal'):
  self.t=0.; self.running=False; self.speed=1.; self.active=set(); self.alarms={}; self.events=deque(maxlen=200); self.trends=deque(maxlen=600); self.trip=set(); self.mode=mode
  self.c={"feed_sp":850,"raw_temp":28,"raw_water":.72,"raw_salt":42,"raw_density":858,"branch_1":85,"branch_2":85,"branch_3":85,"preheat_bypass":10,"wash_water":7.5,"demulsifier":15,"mix_dp":1.2,"voltage_s1":4.8,"voltage_s2":16.5,"drain_s1":45,"drain_s2":38,"n20_flow":840,"k1_bottom_out":72,"k1_reflux":92,"k1_steam":900,"e1_water_drain":35,"p1_fuel":61,"p2_fuel":58,"p3_fuel":56,"p4_fuel":48,"p1_flow":100,"p2_flow":100,"p3_flow":100,"p4_flow":100,"k2_feed":620,"k2_bottom_out":64,"k2_reflux":78,"k2_steam":1250,"e2_water_drain":34,"avz3":72,"avz45":76,"circ1":175,"circ2":118,"circ3":110}
  self.u={"power_6kv":100.,"power_04kv":100.,"steam":10.,"cooling":100.,"air":6.,"ups":30.,"vent_control":True,"vent_elou":True}
  self.ui={"valveL1":100.,"valveL2":70.,"valveL3":70.,"valveL1Motion":"idle","valveL2Motion":"idle","valveL3Motion":"idle","demulsifierOn":True,"electricFieldOn":True,"washWaterOn":True,"levelSetpointK1":54.,"levelSetpointK2":51.,"avoFanOn":True,"safeShutdownInitiated":False,"coilRupture":False,"pumpLeak":False,"furnaceEsd":False}
  self.pumps={n:{"running":run,"trip":False,"capacity":cap,"flow":0} for n,cap,run in [("Н-1",450,1),("Н-1А",450,1),("Н-1Б",450,0),("Н-82",150,1),("Н-20",400,1),("Н-20А",400,1),("Н-20Б",560,0),("Н-6",160,1),("Н-6А",160,0),("Н-6К",218,1),("Н-2",520,1),("Н-2А",540,1),("Н-2Б",560,0),("Н-7",120,1),("Н-7А",120,0),("Н-12",205,1),("Н-13",145,1),("Н-17",140,1)]}
  self.s={"feed":850.,"preheat":130.,"desalt_water":.11,"desalt_salt":3.7,"s1_level_mm":4250.,"s2_level_mm":4300.,"e15":52.,"k1_level":54.,"k1_p":2.4,"k1_top":132.,"k1_bottom":274.,"e1_hc":48.,"e1_water":12.,"p1_out":357.,"p2_out":356.,"p3_out":330.,"p4_out":310.,"p1_metal":405.,"p2_metal":403.,"p3_metal":382.,"p4_metal":365.,"k2_level":51.,"k2_p":.56,"k2_top":136.,"k2_bottom":342.,"e2_hc":50.,"e2_water":11.,"circ1":175.,"circ2":118.,"circ3":110.,"diesel95":345.,"gas":0.}
  if mode=='cold':
   self.c.update(feed_sp=0,n20_flow=0,k2_feed=0,p1_fuel=0,p2_fuel=0,p3_fuel=0,p4_fuel=0); self.s.update(feed=0,preheat=25,k1_top=25,k1_bottom=25,k2_top=25,k2_bottom=25)
   self.ui.update(valveL1=0,valveL2=0,valveL3=0,demulsifierOn=False,electricFieldOn=False,washWaterOn=False)
  if mode=='deviation': self.u['cooling']=55; self.s.update(k1_p=3.8,k2_p=.92,e1_water=27)
  self.record()
 def alarm(self,id,on,prio,text):
  old=self.alarms.get(id)
  if on and not old:self.alarms[id]={"id":id,"priority":prio,"message":text,"time":round(self.t,1),"ack":False,"active":True}
  elif on:old['active']=True
  elif old:old['active']=False
 def step(self,dt=1):
  self.t+=dt; s=self.s;c=self.c;u=self.u; a=self.active
  if 'SC-01' in a:
   for n in ('Н-1','Н-1А','Н-1Б'):self.pumps[n]['running']=False
  if 'SC-02' in a:u['steam']=lag(u['steam'],.2,30,dt)
  if 'SC-03' in a:u['power_6kv']=u['power_04kv']=0
  if 'SC-04' in a:u['ups']=max(0,u['ups']-dt/60)
  if 'SC-05' in a:u['cooling']=lag(u['cooling'],0,25,dt)
  if 'SC-06' in a:u['air']=max(0,u['air']-dt*5/3600)
  if 'SC-09' in a:u['vent_control']=False
  if 'SC-10' in a:u['vent_elou']=False
  if 'SC-15' in a:
   c['p1_fuel']=lag(c['p1_fuel'],35,45,dt);c['p2_fuel']=lag(c['p2_fuel'],35,45,dt)
  feedcap=sum(p['capacity'] for n,p in self.pumps.items() if n.startswith('Н-1') and p['running'] and not p['trip'] and u['power_6kv']>80)
  branch=(c['branch_1']+c['branch_2']+c['branch_3'])/255
  airfactor=clamp((u['air']-1.5)/4,0,1)
  s['feed']=lag(s['feed'],min(c['feed_sp']*airfactor,feedcap)*clamp(branch,0,1.15),18,dt)
  hx=(1-c['preheat_bypass']/100)*.88; s['preheat']=lag(s['preheat'],c['raw_temp']+128*hx,90,dt)
  eff=clamp(.15+.25*c['voltage_s1']/4.8+.25*c['voltage_s2']/16.5+.12*c['wash_water']/7.5+.1*c['demulsifier']/15+.1*max(0,1-abs(c['mix_dp']-1.2)),.05,.985)
  s['desalt_water']=lag(s['desalt_water'],clamp(c['raw_water']*(1-.94*eff),.03,2),100,dt); s['desalt_salt']=lag(s['desalt_salt'],clamp(c['raw_salt']*(1-.96*eff*c['wash_water']/7.5),1,150),120,dt)
  s['s1_level_mm']=clamp(s['s1_level_mm']+(45-c['drain_s1'])*dt*.8,2800,4700); s['s2_level_mm']=clamp(s['s2_level_mm']+(38-c['drain_s2'])*dt*.8,2800,4700)
  n20=min(c['n20_flow']*airfactor,960 if u['power_6kv']>80 else 0)*(0.84 if 'SC-08' in a else 1); s['e15']=clamp(s['e15']+(s['feed']-n20)*dt/8200,0,100)
  p3flow=218*c['p3_flow']/100*(1 if u['power_6kv']>80 else 0); p4flow=164*c['p4_flow']/100*(1 if u['power_6kv']>80 else 0)
  s['p3_out']=lag(s['p3_out'],s['k1_bottom']+c['p3_fuel']*1.15/max(p3flow/218,.18),50,dt); s['p4_out']=lag(s['p4_out'],s['k1_bottom']+c['p4_fuel']*.75/max(p4flow/164,.18),55,dt)
  leakheat=95 if 'SC-07' in a else 0; s['p3_metal']=lag(s['p3_metal'],s['p3_out']+42+max(0,65-p3flow)*1.2+leakheat,32,dt); s['p4_metal']=lag(s['p4_metal'],s['p4_out']+40+max(0,50-p4flow),34,dt)
  k1out=c['k1_bottom_out']/100*930; overhead=clamp(n20*(.12+max(0,s['k1_bottom']-230)/600),0,260); s['k1_level']=clamp(s['k1_level']+(n20-k1out-overhead)*dt/16000-(.2*dt if 'SC-12' in a else 0),0,100)
  steam=u['steam']/10; s['k1_bottom']=lag(s['k1_bottom'],110+.45*(s['preheat']+108)+.6*c['p3_fuel']*1.15+.18*c['p4_fuel']+.008*c['k1_steam']*steam,120,dt)
  cooling=.55*u['cooling']/100+.45*c['avz3']/100*(u['power_04kv']>80); waterflash=max(0,s['e1_water']-28)*.04+(1.35 if 'SC-11' in a else 0)
  s['k1_p']=lag(s['k1_p'],1.15+overhead/170*1.1+(1-cooling)*2.6+waterflash-c['k1_reflux']*.0025,28,dt); s['k1_top']=lag(s['k1_top'],112+10*s['k1_p']+max(0,90-c['k1_reflux'])*.16,65,dt)
  s['e1_water']=clamp(s['e1_water']+(overhead*s['desalt_water']/100*1.8-c['e1_water_drain']*.0085+(8 if 'SC-11' in a else 0))*dt/35,0,100); s['e1_hc']=clamp(s['e1_hc']+((overhead*cooling)-(c['k1_reflux']+43))*dt/1760-(.18*dt if 'SC-13' in a else 0),0,100)
  k2feed=min(c['k2_feed']*airfactor,k1out,1050 if u['power_6kv']>80 else 0); f1=k2feed*.5*c['p1_flow']/100; f2=k2feed*.5*c['p2_flow']/100
  s['p1_out']=lag(s['p1_out'],s['k1_bottom']+c['p1_fuel']*1.24/max(f1/310,.18),48,dt); s['p2_out']=lag(s['p2_out'],s['k1_bottom']+c['p2_fuel']*1.24/max(f2/310,.18),48,dt)
  s['p1_metal']=lag(s['p1_metal'],s['p1_out']+46+max(0,110-f1)+(45 if 'SC-14' in a else 0),30,dt); s['p2_metal']=lag(s['p2_metal'],s['p2_out']+46+max(0,110-f2)+(45 if 'SC-14' in a else 0),30,dt)
  k2ov=clamp(k2feed*(.13+max(0,s['k2_bottom']-310)/500),0,160); s['k2_level']=clamp(s['k2_level']+(k2feed-c['k2_bottom_out']*3.5-k2ov-270)*dt/30000,0,100)
  s['k2_bottom']=lag(s['k2_bottom'],164+.31*((s['p1_out']+s['p2_out'])/2)+.95*(c['p1_fuel']+c['p2_fuel'])/2+.008*c['k2_steam']*steam,130,dt)
  cooling2=.42*u['cooling']/100+.58*c['avz45']/100*(u['power_04kv']>80); wf2=max(0,s['e2_water']-28)*.024+(.45 if 'SC-11' in a else 0)
  s['k2_p']=lag(s['k2_p'],.2+k2ov/120*.28+(1-cooling2)*1.18+wf2-c['k2_reflux']*.0014,24,dt); s['k2_top']=lag(s['k2_top'],116+27*s['k2_p']+max(0,65-c['k2_reflux'])*.18,60,dt)
  s['e2_water']=clamp(s['e2_water']+(k2ov*s['desalt_water']/100*1.4-c['e2_water_drain']*.004+(5 if 'SC-11' in a else 0))*dt/42,0,100); s['e2_hc']=clamp(s['e2_hc']+(k2ov*cooling2-(c['k2_reflux']+20))*dt/2000-(.18*dt if 'SC-13' in a else 0),0,100)
  for key in ('circ1','circ2','circ3'):s[key]=lag(s[key],c[key]*(1 if u['power_6kv']>80 else 0),14,dt)
  s['diesel95']=lag(s['diesel95'],333+max(0,s['k2_bottom']-335)*.9+max(0,100-s['circ2'])*.1,140,dt)
  gasadd=(.14 if 'SC-08' in a else 0)+(.25 if 'SC-07' in a else 0)+(.025 if not u['vent_control'] or not u['vent_elou'] else 0); s['gas']=clamp(s['gas']+(gasadd-.04)*dt,0,100)
  if s['e1_hc']<15:self.pumps['Н-6'].update(running=False,trip=True)
  if s['e2_hc']<15:self.pumps['Н-7'].update(running=False,trip=True)
  if s['p3_metal']>455 or p3flow<65 and c['p3_fuel']>10:c['p3_fuel']=0;self.trip.add('П-3')
  if s['p1_metal']>470:c['p1_fuel']=0;self.trip.add('П-1')
  if s['p2_metal']>470:c['p2_fuel']=0;self.trip.add('П-2')
  if s['k1_p']>=4.8:c['p3_fuel']=c['p4_fuel']=c['k1_steam']=0;self.trip.add('К-1')
  if s['k2_p']>=1.5:c['p1_fuel']=c['p2_fuel']=c['k2_steam']=0;self.trip.add('К-2')
  self.alarm('K1-P-H',s['k1_p']>=4.5,'P1','Давление К-1 ≥ 4,5 кгс/см²'); self.alarm('K2-P-H',s['k2_p']>=1,'P1','Давление К-2 ≥ 1,0 кгс/см²'); self.alarm('E1-W-H',s['e1_water']>28,'P1','Высокий уровень воды Е-1'); self.alarm('E2-W-H',s['e2_water']>28,'P1','Высокий уровень воды Е-2'); self.alarm('ELOU-SALT',s['desalt_salt']>5,'P2','Хлориды после ЭЛОУ > 5 мг/л'); self.alarm('ELOU-WATER',s['desalt_water']>.15,'P2','Вода после ЭЛОУ > 0,15%'); self.alarm('AIR-L',u['air']<4,'P1','Низкое давление приборного воздуха'); self.alarm('CW-L',u['cooling']<60,'P1','Потеря оборотной воды'); self.alarm('GAS-H',s['gas']>20,'P1','Загазованность > 20% НКПР')
  if int(self.t)%2==0:self.record()
 def record(self):self.trends.append({"t":round(self.t,1),"feed":round(self.s['feed'],2),"k1_p":round(self.s['k1_p'],3),"k2_p":round(self.s['k2_p'],3),"k1_bottom":round(self.s['k1_bottom'],2),"k2_bottom":round(self.s['k2_bottom'],2),"desalt_salt":round(self.s['desalt_salt'],3),"p3_metal":round(self.s['p3_metal'],2)})
 def public(self):
  return {"version":VERSION,"time":round(self.t,1),"running":self.running,"speed":self.speed,"mode":self.mode,"state":{k:round(v,3) for k,v in self.s.items()},"controls":[{"id":k,"value":v,"min":CONTROL_META[k][0],"max":CONTROL_META[k][1],"unit":CONTROL_META[k][2]} for k,v in self.c.items()],"utilities":self.u,"pumps":self.pumps,"alarms":{"active":[x for x in self.alarms.values() if x['active']],"history":list(self.alarms.values())},"scenarios":sorted(self.active),"trips":sorted(self.trip),"trends":list(self.trends)}
