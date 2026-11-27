// SPDX-License-Identifier: GPL-3.0-or-later
import { fkPositions, worldToPose } from './canonical.js';
import { DEG, qAxisAngle, qFromTo, vSub } from './qmath.js';

/** Static four-point support pose used to inspect skinning at wide hip angles. */
export function supportPose(_time, { rig }) {
  const { heads } = rig;
  const torso = qAxisAngle([1, 0, 0], 74 * DEG);
  const level = [0, 0, 0, 1];
  const world = { hips: torso, neck: level, head: level };
  function aim(joint, tip, direction) {
    world[joint] = qFromTo(vSub(heads[tip], heads[joint]), direction);
  }
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    aim(side + 'UpperLeg', side + 'LowerLeg', [sign * 0.36, -0.91, 0.20]);
    aim(side + 'LowerLeg', side + 'Foot', [0, -0.08, -1]);
    aim(side + 'Foot', side + 'Toes', [0, 0, -1]);
    aim(side + 'UpperArm', side + 'LowerArm', [sign * 0.15, -1, 0.21]);
    aim(side + 'LowerArm', side + 'Hand', [0, -1, 0.04]);
    aim(side + 'Hand', side + 'MiddleProximal', [0, 0, 1]);
  }
  const pose = { joints: worldToPose(world), root: [0, 0, 0] };
  const p = fkPositions(heads, pose);
  pose.root[1] = 0.035 - Math.min(p.leftLowerLeg[1], p.rightLowerLeg[1], p.leftHand[1], p.rightHand[1]);
  return pose;
}
