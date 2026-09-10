
export interface CleaningSchedule {
  equipmentId: string;
  equipmentName: string;
  quantity: number;
  startTime: Date;
  estimatedCompletionTime: Date;
  actualCompletionTime?: Date;
  status: "scheduled" | "in_progress" | "completed";
}

export interface EquipmentAvailability {
  equipmentId: string;
  availableNow: number;
  availableAt: {
    time: Date;
    quantity: number;
  }[];
}

export class EquipmentAvailabilityCalculator {
  private cleaningSchedules: CleaningSchedule[] = [];

  constructor() {
    this.loadSchedules();
  }

  private loadSchedules(): void {
    const stored = localStorage.getItem("cleaning_schedules");
    if (stored) {
      const schedules = JSON.parse(stored);
      this.cleaningSchedules = schedules.map((schedule: any) => ({
        ...schedule,
        startTime: new Date(schedule.startTime),
        estimatedCompletionTime: new Date(schedule.estimatedCompletionTime),
        actualCompletionTime: schedule.actualCompletionTime
          ? new Date(schedule.actualCompletionTime)
          : undefined,
      }));
    }
  }

  private saveSchedules(): void {
    localStorage.setItem("cleaning_schedules", JSON.stringify(this.cleaningSchedules));
  }

  scheduleEquipmentCleaning(
    equipmentId: string,
    equipmentName: string,
    quantity: number,
    cleaningTimeHours: number
  ): void {
    const now = new Date();
    const completionTime = new Date(now.getTime() + cleaningTimeHours * 60 * 60 * 1000);

    const schedule: CleaningSchedule = {
      equipmentId,
      equipmentName,
      quantity,
      startTime: now,
      estimatedCompletionTime: completionTime,
      status: "in_progress",
    };

    this.cleaningSchedules.push(schedule);
    this.saveSchedules();

    this.notifyAvailabilityChange(equipmentId);
  }

  completeEquipmentCleaning(equipmentId: string): void {
    const activeSchedules = this.cleaningSchedules.filter(
      (schedule) => schedule.equipmentId === equipmentId && schedule.status === "in_progress"
    );

    activeSchedules.forEach((schedule) => {
      schedule.status = "completed";
      schedule.actualCompletionTime = new Date();
    });

    this.saveSchedules();
    this.notifyAvailabilityChange(equipmentId);
  }

  getEquipmentAvailability(
    equipmentId: string,
    currentAvailable: number,
    currentCleaning: number
  ): EquipmentAvailability {
    const now = new Date();
    const activeSchedules = this.cleaningSchedules.filter(
      (schedule) =>
        schedule.equipmentId === equipmentId &&
        schedule.status !== "completed" &&
        schedule.estimatedCompletionTime > now
    );

    const availabilityTimeline: { time: Date; quantity: number }[] = [
      { time: now, quantity: currentAvailable },
    ];

    activeSchedules
      .sort((a, b) => a.estimatedCompletionTime.getTime() - b.estimatedCompletionTime.getTime())
      .forEach((schedule) => {
        const lastEntry = availabilityTimeline[availabilityTimeline.length - 1];
        availabilityTimeline.push({
          time: schedule.estimatedCompletionTime,
          quantity: lastEntry.quantity + schedule.quantity,
        });
      });

    return {
      equipmentId,
      availableNow: currentAvailable,
      availableAt: availabilityTimeline.slice(1),
    };
  }

  canBookEquipment(
    equipmentId: string,
    requiredQuantity: number,
    bookingDate: Date,
    currentAvailable: number,
    currentCleaning: number
  ): { canBook: boolean; availableFrom?: Date; message: string } {
    const availability = this.getEquipmentAvailability(
      equipmentId,
      currentAvailable,
      currentCleaning
    );

    if (availability.availableNow >= requiredQuantity) {
      return {
        canBook: true,
        message: `${requiredQuantity} items available now`,
      };
    }

    for (const slot of availability.availableAt) {
      if (slot.time <= bookingDate && slot.quantity >= requiredQuantity) {
        return {
          canBook: true,
          availableFrom: slot.time,
          message: `${requiredQuantity} items will be available by ${slot.time.toLocaleString()}`,
        };
      }
    }

    const totalAfterCleaning =
      availability.availableAt.length > 0
        ? availability.availableAt[availability.availableAt.length - 1].quantity
        : availability.availableNow;

    return {
      canBook: false,
      message: `Insufficient quantity. Only ${totalAfterCleaning} available after cleaning completes`,
    };
  }

  private notifyAvailabilityChange(equipmentId: string): void {
    const event = new CustomEvent("equipment-availability-changed", {
      detail: { equipmentId },
    });
    window.dispatchEvent(event);
  }

  getCleaningProgress(equipmentId: string): {
    inProgress: number;
    completed: number;
    scheduled: number;
  } {
    const schedules = this.cleaningSchedules.filter(
      (schedule) => schedule.equipmentId === equipmentId
    );

    return {
      inProgress: schedules.filter((s) => s.status === "in_progress").length,
      completed: schedules.filter((s) => s.status === "completed").length,
      scheduled: schedules.filter((s) => s.status === "scheduled").length,
    };
  }

  cleanupOldSchedules(): void {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.cleaningSchedules = this.cleaningSchedules.filter(
      (schedule) =>
        schedule.status !== "completed" || schedule.actualCompletionTime! > sevenDaysAgo
    );
    this.saveSchedules();
  }
}

export const equipmentCalculator = new EquipmentAvailabilityCalculator();
