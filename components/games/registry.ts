'use client';

import type { ComponentType } from 'react';
import BikeRunner from './BikeRunner';
import TownDelivery from './TownDelivery';
import BalloonFlight from './BalloonFlight';
import CatchShoes from './CatchShoes';
import CarrotGuard from './CarrotGuard';
import ParkSnake from './ParkSnake';
import StackBoxes from './StackBoxes';
import Memory from './Memory';
import Simon from './Simon';
import NumberMemory from './NumberMemory';
import WordScramble from './WordScramble';
import ColourMatch from './ColourMatch';
import QuickMaths from './QuickMaths';
import Reaction from './Reaction';

export type Game = { id: string; name: string; desc: string; icon: string; grad: string; unit: string; C: ComponentType };

export const GAMES: Game[] = [
  { id: 'town', name: 'Town Delivery', desc: 'Deliver parcels through the village', icon: '\u{1F69A}', grad: 'linear-gradient(135deg, #10b981, #3b82f6)', unit: 'parcels', C: TownDelivery },
  { id: 'bike', name: 'Bike Ride', desc: 'Jump the cones and boxes', icon: '\u{1F6B4}', grad: 'linear-gradient(135deg, #6d5ce8, #3b82f6)', unit: 'pts', C: BikeRunner },
  { id: 'balloon', name: 'Balloon Flight', desc: 'Fly over the rooftops', icon: '\u{1F388}', grad: 'linear-gradient(135deg, #ec4899, #f59e0b)', unit: 'pts', C: BalloonFlight },
  { id: 'carrot', name: 'Carrot Guard', desc: 'Stop the bunnies in the garden', icon: '\u{1F430}', grad: 'linear-gradient(135deg, #84cc16, #f97316)', unit: 'bunnies', C: CarrotGuard },
  { id: 'catch', name: 'Catch the Shoes', desc: 'Catch shoes, dodge bombs', icon: '\u{1F9FA}', grad: 'linear-gradient(135deg, #f43f5e, #f59e0b)', unit: 'caught', C: CatchShoes },
  { id: 'snake', name: 'Park Snake', desc: 'Eat apples on the lawn', icon: '\u{1F40D}', grad: 'linear-gradient(135deg, #22c55e, #0ea5e9)', unit: 'apples', C: ParkSnake },
  { id: 'stack', name: 'Stack the Boxes', desc: 'Build a tower over the city', icon: '\u{1F4E6}', grad: 'linear-gradient(135deg, #4338ca, #a855f7)', unit: 'boxes', C: StackBoxes },
  { id: 'memory', name: 'Shoe Memory', desc: 'Match all eight pairs', icon: '\u{1F460}', grad: 'linear-gradient(135deg, #8b5cf6, #ec4899)', unit: 'moves', C: Memory },
  { id: 'simon', name: 'Colour Sequence', desc: 'Repeat the growing pattern', icon: '\u{1F3B5}', grad: 'linear-gradient(135deg, #ef4444, #f59e0b)', unit: 'rounds', C: Simon },
  { id: 'number', name: 'Number Memory', desc: 'Remember longer numbers', icon: '\u{1F522}', grad: 'linear-gradient(135deg, #0ea5e9, #10b981)', unit: 'digits', C: NumberMemory },
  { id: 'words', name: 'Word Scramble', desc: 'Unscramble shoe and town words', icon: '\u{1F524}', grad: 'linear-gradient(135deg, #0891b2, #6d5ce8)', unit: 'words', C: WordScramble },
  { id: 'stroop', name: 'Colour Match', desc: 'Word vs. ink colour', icon: '\u{1F3A8}', grad: 'linear-gradient(135deg, #f97316, #8b5cf6)', unit: 'pts', C: ColourMatch },
  { id: 'maths', name: 'Quick Maths', desc: '60 seconds of sums', icon: '\u2795', grad: 'linear-gradient(135deg, #f59e0b, #ef4444)', unit: 'pts', C: QuickMaths },
  { id: 'reaction', name: 'Reaction Test', desc: 'Tap the moment it turns green', icon: '\u26A1', grad: 'linear-gradient(135deg, #10b981, #0ea5e9)', unit: 'ms', C: Reaction },
];
