class AsyncWorker {
    constructor(capacity) {
        this.capacity = capacity;
        this.i = 0;
        this.tasks = [];
    }
    exec(task) {
        return new Promise((resolve, reject) => {
            let run = () => {
                if (this.i < this.capacity) {
                    task()
                        .then((res) => {
                            this.i--;
                            resolve(res);
                            let first = this.tasks.shift();
                            first && first();
                        })
                        .catch((err) => {
                            this.i--;
                            reject(err);
                            let first = this.tasks.shift();
                            first && first();
                        });
                    this.i++;
                } else {
                    this.tasks.push(run);
                }
            };
            run();
        });
    }
}
module.exports = new AsyncWorker(1);